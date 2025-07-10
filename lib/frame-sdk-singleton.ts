"use client";

import { sdk } from "@farcaster/frame-sdk";
import type { Context, SwapToken } from "@farcaster/frame-sdk";

class FrameSDKManager {
  private static instance: FrameSDKManager;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private contextCache: {
    context: Context.FrameContext | null;
    lastFetchTime: number;
  } = {
    context: null,
    lastFetchTime: 0,
  };
  
  private readonly CACHE_DURATION = 30 * 1000; // 30 seconds

  private constructor() {}

  static getInstance(): FrameSDKManager {
    if (!FrameSDKManager.instance) {
      FrameSDKManager.instance = new FrameSDKManager();
    }
    return FrameSDKManager.instance;
  }

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log("FrameSDKManager: Initializing SDK (one-time only)");
      await sdk.actions.ready({});
      this.initialized = true;
      console.log("FrameSDKManager: SDK initialized successfully");
    } catch (error) {
      console.error("FrameSDKManager: Error initializing SDK:", error);
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  async getContext(): Promise<Context.FrameContext> {
    // Ensure SDK is initialized
    await this.initialize();

    const now = Date.now();
    
    // Return cached context if still fresh
    if (
      this.contextCache.context &&
      now - this.contextCache.lastFetchTime < this.CACHE_DURATION
    ) {
      return this.contextCache.context;
    }

    // Fetch fresh context
    try {
      const context = await sdk.context;
      this.contextCache.context = context;
      this.contextCache.lastFetchTime = now;
      return context;
    } catch (error) {
      console.error("FrameSDKManager: Error getting context:", error);
      throw error;
    }
  }

  // Clear cache when needed
  clearCache(): void {
    this.contextCache.context = null;
    this.contextCache.lastFetchTime = 0;
  }

  // Delegate other SDK methods
  async closeFrame(): Promise<void> {
    await this.initialize();
    return sdk.actions.close();
  }

  async redirectToUrl(url: string): Promise<void> {
    await this.initialize();
    return sdk.actions.openUrl(url);
  }

  async isWalletConnected(): Promise<boolean> {
    await this.initialize();
    try {
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
  }

  async connectWallet(): Promise<string[]> {
    await this.initialize();
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
  }

  async signMessage(options: { message: string }): Promise<string> {
    await this.initialize();
    
    // Implementation copied from original frame-sdk.ts
    try {
      if (typeof window === "undefined" || !window.parent) {
        throw new Error("Not in a frame context");
      }

      if (sdk.wallet && sdk.wallet.ethProvider) {
        const accounts = await sdk.wallet.ethProvider.request({
          method: "eth_accounts",
        });

        const accountsArray = Array.isArray(accounts) ? accounts : [];

        if (accountsArray.length === 0) {
          const requestedAccounts = await sdk.wallet.ethProvider.request({
            method: "eth_requestAccounts",
          });

          if (!Array.isArray(requestedAccounts) || requestedAccounts.length === 0) {
            throw new Error("Failed to connect accounts via SDK wallet");
          }
        }

        const activeAccounts = await sdk.wallet.ethProvider.request({
          method: "eth_accounts",
        });

        if (!Array.isArray(activeAccounts) || activeAccounts.length === 0) {
          throw new Error("No active accounts available");
        }

        const address = typeof activeAccounts[0] === "string" && activeAccounts[0].startsWith("0x")
          ? (activeAccounts[0] as `0x${string}`)
          : (`0x${activeAccounts[0]}` as `0x${string}`);

        const data = options.message.startsWith("0x")
          ? (options.message as `0x${string}`)
          : options.message;

        const signature = await sdk.wallet.ethProvider.request({
          method: "personal_sign",
          params: [data, address] as [`0x${string}`, `0x${string}`],
        });

        return signature as string;
      }

      // Fallback to window.ethereum
      if (typeof window.ethereum !== "undefined") {
        const accounts = await (window.ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }).request({
          method: "eth_requestAccounts",
        });

        const accountsArray = Array.isArray(accounts) ? accounts : [];

        if (accountsArray.length === 0) {
          throw new Error("No accounts available to sign");
        }

        const address = typeof accountsArray[0] === "string" && accountsArray[0].startsWith("0x")
          ? (accountsArray[0] as `0x${string}`)
          : (`0x${accountsArray[0]}` as `0x${string}`);

        const data = options.message.startsWith("0x")
          ? (options.message as `0x${string}`)
          : options.message;

        const signature = await (window.ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }).request({
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
  }

  // Get the raw SDK for event handling
  getSDK() {
    return sdk;
  }

  // Check if we're in a mini app context
  async isInMiniApp(): Promise<boolean> {
    await this.initialize();
    try {
      return await sdk.isInMiniApp() || (await this.getContext()).client.clientFid == 309857;
    } catch (error) {
      console.error("Error checking mini app status:", error);
      return false;
    }
  }

  async swapToken(params: { sellToken?: string; buyToken?: string; sellAmount?: string }): Promise<SwapToken.SwapTokenResult> {
    await this.initialize();
    return sdk.actions.swapToken(params);
  }

  async hapticImpact(style?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid'): Promise<void> {
    await this.initialize();
    try {
      if (style) {
        await sdk.haptics.impactOccurred(style);
      } else {
        await sdk.haptics.impactOccurred('medium');
      }
    } catch (error) {
      console.error("Error triggering haptic impact:", error);
    }
  }

  async hapticNotification(type: 'success' | 'warning' | 'error'): Promise<void> {
    await this.initialize();
    try {
      await sdk.haptics.notificationOccurred(type);
    } catch (error) {
      console.error("Error triggering haptic notification:", error);
    }
  }

  async hapticSelection(): Promise<void> {
    await this.initialize();
    try {
      await sdk.haptics.selectionChanged();
    } catch (error) {
      console.error("Error triggering haptic selection:", error);
    }
  }
}

// Export singleton instance wrapped in the same interface
export const frameSdk = {
  getContext: () => FrameSDKManager.getInstance().getContext(),
  closeFrame: () => FrameSDKManager.getInstance().closeFrame(),
  redirectToUrl: (url: string) => FrameSDKManager.getInstance().redirectToUrl(url),
  isWalletConnected: () => FrameSDKManager.getInstance().isWalletConnected(),
  connectWallet: () => FrameSDKManager.getInstance().connectWallet(),
  signMessage: (options: { message: string }) => FrameSDKManager.getInstance().signMessage(options),
  isInMiniApp: () => FrameSDKManager.getInstance().isInMiniApp(), 
  swapToken: (params: { sellToken?: string; buyToken?: string; sellAmount?: string }) => FrameSDKManager.getInstance().swapToken(params),
};

// Export the manager for providers that need event handling
export const frameSDKManager = FrameSDKManager.getInstance();