"use client";
import FrameSDK from "@farcaster/frame-sdk";
import farcasterFrame from "@farcaster/frame-wagmi-connector";
import type { ReactNode } from "react";
import { customconfig } from "@/config/config";
import { connect } from "wagmi/actions";
import { useEffect } from "react";

export function FarcasterFrameProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const init = async () => {
      const context = await FrameSDK.context;

      // Autoconnect if running in a frame.
      if (context?.client.clientFid) {
        connect(customconfig, { connector: farcasterFrame() });
      }

      // Hide splash screen after UI renders.
      setTimeout(() => {
        FrameSDK.actions.ready();
      }, 500);
    };
    init();
  }, []);

  return <>{children}</>;
}
