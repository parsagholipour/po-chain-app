"use client";

import { makeQueryClient } from "@/lib/get-query-client";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider } from "next-auth/react";
import NextTopLoader from "nextjs-toploader";
import { useEffect, useState } from "react";
import { ConfirmProvider } from "@/components/confirm-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  useEffect(() => {
    const restoreWindow = window as Window & { __PO_REACT_APP_MOUNTED__?: boolean };
    restoreWindow.__PO_REACT_APP_MOUNTED__ = true;
    return () => {
      restoreWindow.__PO_REACT_APP_MOUNTED__ = false;
    };
  }, []);

  return (
    <SessionProvider basePath="/api/auth">
      <NextTopLoader
        color="var(--primary)"
        height={3}
        showSpinner={false}
        zIndex={9999}
      />
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConfirmProvider>
            {children}
            <Toaster richColors position="top-center" />
          </ConfirmProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === "development" ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </SessionProvider>
  );
}
