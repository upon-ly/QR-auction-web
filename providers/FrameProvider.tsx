"use client";
import FrameSDK from "@farcaster/frame-sdk";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function FarcasterFrameProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const init = async () => {
      // Get context but don't auto-connect
      await FrameSDK.context;

      // Hide splash screen after UI renders.
      setTimeout(() => {
        FrameSDK.actions.ready();
      }, 500);
    };
    init();
  }, []);

  return <>{children}</>;
}
