/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import sdk from "@farcaster/frame-sdk";
import type { Context } from "@farcaster/frame-sdk";

// Define a type for our extended SDK
export interface ExtendedFrameSdk {
  getContext: () => Promise<Context.FrameContext>;
  closeFrame: () => Promise<void>;
  redirectToUrl: (url: string) => Promise<void>;
  isWalletConnected: () => Promise<boolean>;
  connectWallet: () => Promise<string[]>;
  signMessage: (options: { message: string }) => Promise<string>;
}

// Export the SDK wrapper with extended type
export const frameSdk: ExtendedFrameSdk = {
  getContext: async (): Promise<Context.FrameContext> => {
    try {
      const context = await sdk.context;
      await sdk.actions.ready({});
      return context;
    } catch (error) {
      console.error("Error getting frame context:", error);
      throw error;
    }
  },

  closeFrame: (): Promise<void> => {
    return sdk.actions.close();
  },

  redirectToUrl: (url: string): Promise<void> => {
    return sdk.actions.openUrl(url);
  },

  // Add a method to check wallet connection in the frame environment
  isWalletConnected: async (): Promise<boolean> => {
    try {
      // If we have access to the wallet provider, try to get accounts
      if (sdk.wallet && sdk.wallet.ethProvider) {
        const accounts = await sdk.wallet.ethProvider.request({
          method: "eth_accounts",
        });

        return Array.isArray(accounts) && accounts.length > 0;
      }

      return false;
    } catch (error) {
      console.error("Error checking wallet connection:", error);
      return false;
    }
  },

  // Add a method to directly connect wallet in frames
  connectWallet: async (): Promise<string[]> => {
    try {
      if (!sdk.wallet || !sdk.wallet.ethProvider) {
        throw new Error("Wallet provider not available in frame");
      }

      const accounts = await sdk.wallet.ethProvider.request({
        method: "eth_requestAccounts",
      });

      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      console.error("Error connecting wallet in frame:", error);
      return [];
    }
  },

  signMessage: async (options: { message: string }): Promise<string> => {
    try {
      // Check if we're in a Farcaster frame context
      if (typeof window === "undefined" || !window.parent) {
        throw new Error("Not in a frame context");
      }

      console.log(
        "Attempting to sign message in frame context:",
        options.message
      );

      // First try using the Farcaster SDK wallet if available
      if (sdk.wallet && sdk.wallet.ethProvider) {
        console.log("Using Farcaster SDK wallet for signing");
        try {
          // Get accounts or request connection
          const accounts = await sdk.wallet.ethProvider.request({
            method: "eth_accounts",
          });

          const accountsArray = Array.isArray(accounts) ? accounts : [];

          if (accountsArray.length === 0) {
            console.log(
              "No accounts available in SDK wallet, attempting to connect"
            );
            const requestedAccounts = await sdk.wallet.ethProvider.request({
              method: "eth_requestAccounts",
            });

            if (
              !Array.isArray(requestedAccounts) ||
              requestedAccounts.length === 0
            ) {
              throw new Error("Failed to connect accounts via SDK wallet");
            }
          }

          // Get accounts again after potential connection
          const activeAccounts = await sdk.wallet.ethProvider.request({
            method: "eth_accounts",
          });

          if (!Array.isArray(activeAccounts) || activeAccounts.length === 0) {
            throw new Error("No active accounts available");
          }

          console.log("Active accounts from SDK wallet:", activeAccounts);

          // Format the address to ensure it has 0x prefix
          const address =
            typeof activeAccounts[0] === "string" &&
            activeAccounts[0].startsWith("0x")
              ? (activeAccounts[0] as `0x${string}`)
              : (`0x${activeAccounts[0]}` as `0x${string}`);

          // Format message to ensure it has 0x prefix if not already a string
          const data = options.message.startsWith("0x")
            ? (options.message as `0x${string}`)
            : options.message;

          console.log("Using signing params:", data, address);

          const signature = await sdk.wallet.ethProvider.request({
            method: "personal_sign",
            params: [data, address] as [`0x${string}`, `0x${string}`],
          });

          return signature as string;
        } catch (sdkError) {
          console.error("Error using SDK wallet for signing:", sdkError);
          // Fall through to window.ethereum as backup
        }
      }

      // Fallback to window.ethereum (likely desktop case)
      if (typeof window.ethereum !== "undefined") {
        console.log("Falling back to window.ethereum for signing");

        const accounts = await (window.ethereum as any).request({
          method: "eth_requestAccounts",
        });

        const accountsArray = Array.isArray(accounts) ? accounts : [];

        if (accountsArray.length === 0) {
          throw new Error("No accounts available to sign");
        }

        // Format the address to ensure it has 0x prefix
        const address =
          typeof accountsArray[0] === "string" &&
          accountsArray[0].startsWith("0x")
            ? (accountsArray[0] as `0x${string}`)
            : (`0x${accountsArray[0]}` as `0x${string}`);

        // Format message to ensure it has 0x prefix if not already a string
        const data = options.message.startsWith("0x")
          ? (options.message as `0x${string}`)
          : options.message;

        console.log(
          "Using signing params with window.ethereum:",
          data,
          address
        );

        const signature = await (window.ethereum as any).request({
          method: "personal_sign",
          params: [data, address] as [`0x${string}`, `0x${string}`],
        });

        return signature as string;
      } else {
        throw new Error("No Ethereum provider available for signing");
      }
    } catch (error) {
      console.error("Error signing message:", error);
      throw error;
    }
  },
};
