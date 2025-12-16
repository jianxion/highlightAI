/*
import { AuthProvider } from "../features/auth/context/AuthContext.tsx";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

import React from "react";
import { ApolloProvider } from "@apollo/client/react";
import { apolloClient } from "../shared/graphql/client";
import { AuthProvider } from "../features/auth/context/AuthContext";
import ErrorBoundary from "../shared/components/ErrorBoundary";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ApolloProvider client={apolloClient}>{children}</ApolloProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
*/
import { type ReactNode } from "react";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "../shared/graphql/client";
import { AuthProvider } from "../features/auth/context/AuthContext";
import ErrorBoundary from "../shared/components/ErrorBoundary";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ApolloProvider client={apolloClient}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}
