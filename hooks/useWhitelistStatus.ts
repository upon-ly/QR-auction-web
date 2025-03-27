import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { Address } from 'viem';
import QRAuctionV2 from "../abi/QRAuctionV2.json";

export function useWhitelistStatus(address: Address | undefined) {
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const publicClient = usePublicClient();

  useEffect(() => {
    async function checkWhitelist() {
      if (!address || !publicClient) {
        setIsWhitelisted(false);
        setIsLoading(false);
        return;
      }

      try {
        const result = await publicClient.readContract({
          address: process.env.NEXT_PUBLIC_QRAuctionV2 as Address,
          abi: QRAuctionV2.abi,
          functionName: 'isWhitelistedSettler',
          args: [address],
        });

        setIsWhitelisted(!!result);
      } catch (error) {
        console.error('Error checking whitelist status:', error);
        setIsWhitelisted(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkWhitelist();
  }, [address, publicClient]);

  return { isWhitelisted, isLoading };
} 