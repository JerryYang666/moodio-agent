import "@/styles/globals.css";
import "@/styles/jsoneditor.css";
import { Metadata, Viewport } from "next";
import clsx from "clsx";

import { Providers } from "./providers";

import { siteConfig } from "@/config/site";
import { fontSans } from "@/config/fonts";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { OnboardingModal } from "@/components/onboarding-modal";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head />
      <body
        className={clsx(
          "min-h-screen text-foreground bg-background font-sans antialiased",
          fontSans.variable
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "dark" }}>
          <div className="relative flex h-screen w-full overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 h-full overflow-hidden">
              <div className="md:hidden">
                <Navbar />
              </div>
              <main className="flex-1 overflow-y-auto p-6">
                <div className="container mx-auto max-w-7xl h-full">
                  {children}
                </div>
              </main>
            </div>
            <OnboardingModal />
          </div>
        </Providers>
      </body>
    </html>
  );
}
