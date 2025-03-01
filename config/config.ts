import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, base } from "wagmi/chains";

export const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID;
if (!projectId) throw new Error("Project ID is not defined");

const chains =
  (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "false"
    ? ([base] as const)
    : ([baseSepolia] as const);

export const config = getDefaultConfig({
  appName: "UBI",
  projectId: projectId,
  chains: chains,
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
  appName: "UBI",
  projectId: projectId,
  chains: chains,
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
