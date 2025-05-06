import { createConfig } from "@privy-io/wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { http } from "wagmi";

// Check if testnets are enabled
const useTestnets = (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "true";

// Create the Wagmi config for Privy
export const wagmiConfig = createConfig({
  // Pass chains directly in the config without the intermediate variable
  chains: useTestnets ? [baseSepolia] : [base],
  transports: {
    [baseSepolia.id]: http(
      `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
    [base.id]: http(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
  },
}); 