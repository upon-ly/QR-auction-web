"use client";

import type { ReactNode } from "react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { FarcasterFrameProvider } from "./FrameProvider";
import { SupabaseProvider } from "./SupabaseProvider";
import { AirdropProvider } from "./AirdropProvider";
import { LikesRecastsProvider } from "./LikesRecastsProvider";
import { PopupCoordinator } from "./PopupCoordinator";
import { useTheme } from "next-themes";
import { useState, useEffect, useMemo } from "react"; // Import useMemo

// Import Privy-specific components
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";

// Import the FUNCTION to get the config, not the config object directly
import { getPrivyConfig } from "../config/privyConfig";
import { wagmiConfig } from "../config/wagmiConfig";

// Create a singleton instance of QueryClient that can be imported elsewhere
export const queryClient = new QueryClient();

export function Provider(props: { children: ReactNode }) {
  // Get current theme
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Need to wait for client-side hydration to get the actual theme
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use the current theme or fallback to light if not mounted yet
  const currentTheme = mounted ? (resolvedTheme || theme) : 'light';

  // Call getPrivyConfig() inside the component render logic
  // Use useMemo to prevent recalculating on every render unless theme changes
  const dynamicPrivyConfig = useMemo(() => {
    const config = getPrivyConfig(); // Get base config
    return {
      ...config,
      theme: currentTheme === 'dark' ? 'dark' : 'light',
      appearance: {
        ...config.appearance,
        ...(currentTheme === 'dark' ? {
          accentColor: "#FFFFFF",
          textColor: "#000000",
        } : {}),
      },
      // Ensure embeddedWallets structure is correct
      embeddedWallets: {
        ...config.embeddedWallets,
         // No need for showWalletUIs here unless specifically required by Privy
      },
      externalWallets: {
        ...config.externalWallets,
      },
    };
  }, [currentTheme]); // Recompute only when theme changes

  return (
    <FarcasterFrameProvider>
      {/* Pass the dynamically generated config */}
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
        config={dynamicPrivyConfig}
      >
        <SmartWalletsProvider>
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig}>
              <SupabaseProvider>
                <PopupCoordinator>
                  <LikesRecastsProvider>
                    <AirdropProvider>{props.children}</AirdropProvider>
                  </LikesRecastsProvider>
                </PopupCoordinator>
              </SupabaseProvider>
            </WagmiProvider>
          </QueryClientProvider>
        </SmartWalletsProvider>
      </PrivyProvider>
    </FarcasterFrameProvider>
  );
}

// LinkVisitProvider needs auction details, so we create a special provider to use in the auction page
export interface LinkVisitProviderProps {
  children: ReactNode;
  auctionId: number;
  winningUrl: string;
  winningImage: string;
}

// Import dynamically to avoid circular dependencies
import dynamic from 'next/dynamic';
const LinkVisitProvider = dynamic(() => import('./LinkVisitProvider').then(mod => mod.LinkVisitProvider));

export function AuctionProvider({ children, auctionId, winningUrl, winningImage }: LinkVisitProviderProps) {
  return (
    <LinkVisitProvider
      auctionId={auctionId}
      winningUrl={winningUrl}
      winningImage={winningImage}
    >
      {children}
    </LinkVisitProvider>
  );
}
