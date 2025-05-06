import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { Address } from 'viem';
import QRAuctionV3 from "../abi/QRAuctionV3.json";

export function useWhitelistStatus(address: Address | undefined) {
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const publicClient = usePublicClient();

  useEffect(() => {
    async function checkWhitelist() {
      if (!address || !publicClient) {
        console.log('Cannot check whitelist status: No address or public client');
        setIsWhitelisted(false);
        setIsLoading(false);
        return;
      }

      const contractAddress = process.env.NEXT_PUBLIC_QRAuctionV3 as Address;
      console.log(`Checking whitelist status for address ${address} on contract ${contractAddress}`);

      try {
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: QRAuctionV3.abi,
          functionName: 'isWhitelistedSettler',
          args: [address],
        });

        console.log(`Whitelist status for ${address}: ${!!result}`);
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