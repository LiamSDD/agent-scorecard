import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { RunStoreProvider } from "@/components/run-store";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { THEME_SCRIPT } from "@/components/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "agent-scorecard",
    template: "%s · agent-scorecard",
  },
  description:
    "Scorecards for AI coding agent runs. Drop in a Claude Code transcript, see what the agent did, what it cost, and whether the work holds up.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only-focusable btn absolute left-3 top-3 z-50">
          Skip to content
        </a>
        <RunStoreProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </RunStoreProvider>
      </body>
    </html>
  );
}
