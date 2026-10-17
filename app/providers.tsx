"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // New client per server render; one shared client in the browser.
  if (typeof window === "undefined") return new QueryClient();
  browserQueryClient ??= new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
