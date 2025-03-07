import { createConfig, http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, base } from "wagmi/chains";

import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
  metaMaskWallet,
} from "@rainbow-me/rainbowkit/wallets";

export const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID;
if (!projectId) throw new Error("Project ID is not defined");

const chains =
  (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "false"
    ? ([base] as const)
    : ([baseSepolia] as const);

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        rainbowWallet,
        walletConnectWallet,
        coinbaseWallet,
        metaMaskWallet,
      ],
    },
  ],
  {
    appName: "QR auction",
    projectId: projectId,
  }
);

export const customconfig = createConfig({
  connectors: [...connectors, farcasterFrame()],
  chains,
  transports: {
    [baseSepolia.id]: http(
      `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
    [base.id]: http(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
  },
  ssr: true,
});

export const config = getDefaultConfig({
  appName: "QR auction",
  projectId: projectId,
  chains: chains,
  appIcon:
    "https://dd.dexscreener.com/ds-data/tokens/base/0x2b5050f01d64fbb3e4ac44dc07f0732bfb5ecadf.png?size=lg&key=c66166",
  transports: {
    [baseSepolia.id]: http(
      `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
    [base.id]: http(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
  },
  ssr: true,
});

export const fetchConfig = getDefaultConfig({
  appName: "QR Auction",
  projectId: projectId,
  chains: chains,
  appIcon:
    "https://dd.dexscreener.com/ds-data/tokens/base/0x2b5050f01d64fbb3e4ac44dc07f0732bfb5ecadf.png?size=lg&key=c66166",
  transports: {
    [baseSepolia.id]: http(
      `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
    [base.id]: http(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
  },
  ssr: true,
});
