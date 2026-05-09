"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#15160f",
            border: "1px solid #2c2e23",
            color: "#ede8de",
            borderRadius: "3px",
            fontFamily: "Geist, Inter, system-ui, sans-serif",
            fontSize: "13px",
          },
          className: "!font-body",
        }}
      />
    </QueryClientProvider>
  );
}
