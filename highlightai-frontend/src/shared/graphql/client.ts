import { ApolloClient, InMemoryCache, ApolloLink, HttpLink, split } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";

/**
 * Simple debug logger for GraphQL operations
 */
const debugFlags = {
  GRAPHQL: import.meta.env.VITE_DEBUG_GRAPHQL === "true",
} as const;

function dbg(flag: keyof typeof debugFlags, message: string, data?: unknown) {
  if (!debugFlags[flag]) return;
  const prefix = `[${flag}]`;
  if (data !== undefined) console.log(prefix, message, data);
  else console.log(prefix, message);
}

function dbgError(flag: keyof typeof debugFlags, message: string, err?: unknown) {
  if (!debugFlags[flag]) return;
  const prefix = `[${flag}]`;
  console.error(prefix, message, err);
}

/**
 * IMPORTANT: AppSync with Cognito typically expects Authorization header to contain the JWT directly.
 * Your app currently stores tokens in AuthContext + localStorage.
 *
 * Choose the token you want AppSync to accept:
 * - idToken is common for "user identity" claims
 * - accessToken is common for authorization scopes
 *
 * We'll default to idToken if present; fallback to accessToken.
 */
function getJwt(): string {
  try {
    const raw = localStorage.getItem("highlightai_auth");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.idToken || parsed?.accessToken || "";
  } catch {
    return "";
  }
}

/**
 * ApolloLink to log GraphQL ops + errors when debug enabled.
 */
const debugLink = new ApolloLink((operation, forward) => {
  dbg("GRAPHQL", `➡️ ${operation.operationName || "UnnamedOp"} request`, {
    variables: operation.variables,
  });

  return forward(operation).map((result) => {
    if (result.errors?.length) {
      dbgError(
        "GRAPHQL",
        `❌ ${operation.operationName || "UnnamedOp"} GraphQL errors`,
        result.errors
      );
    } else {
      dbg(
        "GRAPHQL",
        `✅ ${operation.operationName || "UnnamedOp"} response`,
        result.data
      );
    }
    return result;
  });
});

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_APPSYNC_HTTP_URL,
  fetch: async (uri, options) => {
    // Attach JWT at request time (so it works after login without refresh).
    const jwt = getJwt();
    const headers = new Headers(options?.headers || {});
    if (jwt) headers.set("Authorization", jwt);

    dbg("GRAPHQL", "HTTP headers", { Authorization: jwt ? "present" : "missing" });

    return fetch(uri, { ...options, headers });
  },
});

/**
 * WebSocket link for subscriptions (AppSync realtime endpoint).
 * The connectionParams is where we send JWT.
 */
const wsLink = new GraphQLWsLink(
  createClient({
    url: import.meta.env.VITE_APPSYNC_WS_URL,
    connectionParams: async () => {
      const jwt = getJwt();
      dbg("GRAPHQL", "WS connection params", { Authorization: jwt ? "present" : "missing" });
      return { Authorization: jwt };
    },
    on: {
      connected: () => dbg("GRAPHQL", "WS connected"),
      closed: () => dbg("GRAPHQL", "WS closed"),
      error: (e) => dbgError("GRAPHQL", "WS error", e),
    },
  })
);

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === "OperationDefinition" && def.operation === "subscription";
  },
  wsLink,
  httpLink
);

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([debugLink, splitLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          /**
           * Makes pagination + merging easier later.
           * For now, we'll handle merging in our hook, but this prepares you for Phase 2.
           */
          getFeed: {
            keyArgs: false, // treat different args as the same field (pagination)
            merge(existing, incoming) {
              // Keep it simple: we won't auto-merge here to avoid surprises.
              // We'll merge explicitly in the hook for clearer debugging.
              return incoming ?? existing;
            },
          },
        },
      },
    },
  }),
});