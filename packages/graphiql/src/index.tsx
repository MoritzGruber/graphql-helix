import copyToClipboard from "copy-to-clipboard";
import GraphiQLExplorer from "graphiql-explorer";
import GraphiQL from "graphiql";
import fetch from "isomorphic-fetch";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { buildClientSchema, getIntrospectionQuery, parse } from "graphql";

function switchProtocols(pointer: string, protocolMap: Record<string, string>): string {
  return Object.entries(protocolMap).reduce(
    (prev, [source, target]) => prev.replace(`${source}://`, `${target}://`).replace(`${source}:\\`, `${target}:\\`),
    pointer
  );
}

const prepareGETUrl = ({
  baseUrl,
  query,
  variables,
  operationName,
  extensions,
}: {
  baseUrl: string;
  query: string;
  variables: any;
  operationName?: string;
  extensions?: any;
}) => {
  const HTTP_URL = switchProtocols(baseUrl, {
    wss: "https",
    ws: "http",
  });
  const dummyHostname = "https://dummyhostname.com";
  const validUrl = HTTP_URL.startsWith("http")
    ? HTTP_URL
    : HTTP_URL.startsWith("/")
    ? `${dummyHostname}${HTTP_URL}`
    : `${dummyHostname}/${HTTP_URL}`;
  const urlObj = new URL(validUrl);
  urlObj.searchParams.set("query", query);
  if (variables && Object.keys(variables).length > 0) {
    console.log(` JSON.stringify(variables)`, JSON.stringify(variables), variables);
    urlObj.searchParams.set("variables", variables);
  }
  if (operationName) {
    urlObj.searchParams.set("operationName", operationName);
  }
  if (extensions) {
    urlObj.searchParams.set("extensions", JSON.stringify(extensions));
  }
  const finalUrl = urlObj.toString().replace(dummyHostname, "");
  return finalUrl;
};

export interface Options {
  defaultQuery?: string;
  defaultVariableEditorOpen?: boolean;
  endpoint?: string;
  headers?: string;
  headerEditorEnabled?: boolean;
}



export const init = async ({
  defaultQuery,
  defaultVariableEditorOpen,
  endpoint = "/graphql",
  headers = "{}",
  headerEditorEnabled = true,
}: Options = {}): Promise<void> => {

  function graphQLFetcher(graphQLParams) {
    return fetch(endpoint, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graphQLParams),
    }).then((response) => response.json());
  }

  const searchParams = new URLSearchParams(window.location.search);
  const initialOperationName = searchParams.get("operationName") || undefined;
  const initialQuery = searchParams.get("query") || defaultQuery ||  undefined;
  const initialVariables = searchParams.get("variables") || "{}";

  ReactDOM.render(
    React.createElement(() => {
      const graphiqlRef = React.useRef<GraphiQL | null>(null);
      const [state, setState] = React.useState({
        schema: null,
        query: initialQuery,
        variables: initialVariables,
        operationName: initialOperationName,
        explorerIsOpen: false,
      } as {
        variables: any;
        schema: any;
        operationName: any;
        query: any;
        explorerIsOpen: boolean;
      });

      const _handleInspectOperation = (cm: any, mousePos: { line: Number; ch: Number }) => {
        let parsedQuery;
        try {
          parsedQuery = parse(state.query || "");
        } catch (error) {
          console.error("Error parsing query: ", error);
          return;
        }
        if (!parsedQuery) {
          console.error("Couldn't parse query document");
          return null;
        }

        var token = cm.getTokenAt(mousePos);
        var start = { line: mousePos.line, ch: token.start };
        var end = { line: mousePos.line, ch: token.end };
        var relevantMousePos = {
          start: cm.indexFromPos(start),
          end: cm.indexFromPos(end),
        };

        var position = relevantMousePos;

        var def = parsedQuery.definitions.find((definition) => {
          if (!definition.loc) {
            console.log("Missing location information for definition");
            return false;
          }

          const { start, end } = definition.loc;
          return start <= position.start && end >= position.end;
        });

        if (!def) {
          console.error("Unable to find definition corresponding to mouse position");
          return null;
        }

        var operationKind =
          def.kind === "OperationDefinition" ? def.operation : def.kind === "FragmentDefinition" ? "fragment" : "unknown";

        var operationName =
          def.kind === "OperationDefinition" && !!def.name
            ? def.name.value
            : def.kind === "FragmentDefinition" && !!def.name
            ? def.name.value
            : "unknown";

        var selector = `.graphiql-explorer-root #${operationKind}-${operationName}`;

        var el = document.querySelector(selector);
        el && el.scrollIntoView();
      };

      React.useEffect(() => {
        graphQLFetcher({
          query: getIntrospectionQuery(),
        }).then((result) => {
          const editor = graphiqlRef?.current?.getQueryEditor();
          if(editor){
            editor.setOption('extraKeys', {
              ...(editor.options.extraKeys || {}),
              'Shift-Alt-LeftClick': _handleInspectOperation,
            });
          }

          setState((state) => ({ ...state, schema: buildClientSchema(result.data) }));
        });
      }, []);

      const _handleEditQuery = (query: string): void => {
        setState((state) => ({ ...state, query }));
      };

      const _handleToggleExplorer = () => {
        setState((state) => ({ ...state, explorerIsOpen: !state.explorerIsOpen }));
      };

      const onShare = () => {
        const state = graphiqlRef.current?.state;

        copyToClipboard(
          prepareGETUrl({
            baseUrl: window.location.href,
            query: state?.query || "",
            variables: state?.variables,
            operationName: state?.operationName,
          })
        );
      };

      return graphQLFetcher ? (
        <div className="graphiql-container">
          <GraphiQLExplorer
            schema={state.schema}
            query={state.query}
            onEdit={_handleEditQuery}
            explorerIsOpen={state.explorerIsOpen}
            onToggleExplorer={_handleToggleExplorer}
          />
          <GraphiQL
            defaultQuery={state.query}
            defaultVariableEditorOpen={defaultVariableEditorOpen}
            fetcher={graphQLFetcher}
            headers={headers}
            variables={state.variables}
            headerEditorEnabled={headerEditorEnabled}
            operationName={state.operationName}
            query={state.query}
            ref={graphiqlRef}
            toolbar={{
              additionalContent: (
                <>
                  <GraphiQL.Button label="Copy Link" title="Copy Link" onClick={onShare} />
                  <GraphiQL.Button onClick={_handleToggleExplorer} label="Explorer" title="Toggle Explorer" />
                </>
              ),
            }}
          />
        </div>
      ) : null;
    }, {}),
    document.body
  );
};
