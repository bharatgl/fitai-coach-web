"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * 60 * 1_000,
        refetchOnWindowFocus: false,
        retry: 1,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        staleTime: 30_000,
      },
    },
  }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
