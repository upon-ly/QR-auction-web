"use client";

import type { ReactNode } from "react";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { FarcasterFrameProvider } from "./FrameProvider";
import { SupabaseProvider } from "./SupabaseProvider";

import { customconfig } from "../config/config";

const queryClient = new QueryClient();

export function Provider(props: { children: ReactNode }) {
  return (
    <FarcasterFrameProvider>
      <WagmiProvider config={customconfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <SupabaseProvider>{props.children}</SupabaseProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </FarcasterFrameProvider>
  );
}
