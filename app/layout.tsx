import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppChrome } from "@/components/app-chrome";
import { APP_NAME } from "@/lib/app-name";
import { normalizeStoreTheme } from "@/lib/store-theme";
import { getSessionStoreContextBundle } from "@/lib/store-context";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { storeContext } = await getSessionStoreContextBundle();
  const shellTheme = normalizeStoreTheme(
    storeContext?.activeStore?.theme ?? null,
  );

  return {
    title: APP_NAME,
    description: "Next.js, Prisma, shadcn/ui, TanStack Query & Table",
    themeColor: shellTheme.primaryColor,
    icons: {
      icon: [
        {
          url: "/api/branding/favicon",
          type: "image/svg+xml",
        },
      ],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
