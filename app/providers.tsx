"use client";

import type { ThemeProviderProps } from "next-themes";

import * as React from "react";
import { HeroUIProvider } from "@heroui/system";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ToastProvider } from "@heroui/toast";
import { AuthProvider } from "@/components/auth-provider";
import { ChatProvider } from "@/components/chat-provider";
import { CollectionsProvider } from "@/components/collections-provider";
import { VideoProvider } from "@/components/video-provider";
import { CreditsProvider } from "@/hooks/use-credits";
import { IOSInstallPrompt } from "@/components/ios-install-prompt";
import { LocaleAutoDetect } from "@/components/locale-auto-detect";
import { ReduxProvider } from "@/lib/providers/redux-provider";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

export function Providers({ children, themeProps }: ProvidersProps) {
  const router = useRouter();

  return (
    <ReduxProvider>
      <HeroUIProvider navigate={router.push}>
        <NextThemesProvider {...themeProps}>
          <AuthProvider>
            <CreditsProvider>
              <ChatProvider>
                <CollectionsProvider>
                  <VideoProvider>
                    <ToastProvider />
                    <LocaleAutoDetect />
                    <IOSInstallPrompt />
                    {children}
                  </VideoProvider>
                </CollectionsProvider>
              </ChatProvider>
            </CreditsProvider>
          </AuthProvider>
        </NextThemesProvider>
      </HeroUIProvider>
    </ReduxProvider>
  );
}
