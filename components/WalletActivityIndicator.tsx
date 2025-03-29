import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onWalletActivity } from '@/lib/channelManager';
import { useBaseColors } from '@/hooks/useBaseColors';
import { getFarcasterUser } from '@/utils/farcaster';
import { useAccount } from 'wagmi';
import { getName } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';
import { Address } from 'viem';
import { useWalletActivity } from '@/hooks/useWalletActivity';

interface ConnectedUserInfo {
  address: string;
  displayName: string;
  farcasterUsername: string | null;
  isResolved: boolean;
  isAddress: boolean;
}

type WalletActivityAction = 'connected';

export const WalletActivityIndicator = () => {
  const [connectedUser, setConnectedUser] = useState<ConnectedUserInfo | null>(null);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const isBaseColors = useBaseColors();
  const { address } = useAccount();
  
  // Enable wallet activity broadcasting
  useWalletActivity();

  // Format address for display
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Handle new connection
  const handleNewConnection = async (userAddress: string) => {
    // Don't show our own connection
    if (address && userAddress === address) return;

    // Clear existing timeout
    if (timeoutId) clearTimeout(timeoutId);

    try {
      // Fetch both identities concurrently
      const [name, farcasterInfo] = await Promise.allSettled([
        getName({
          address: userAddress as Address,
          chain: base,
        }).catch(() => null), // Handle 404s gracefully
        getFarcasterUser(userAddress).catch(() => null) // Handle 404s gracefully
      ]);

      // Determine final display name with priority
      let displayName = formatAddress(userAddress);
      let isAddress = true;

      // Check Farcaster first (if resolved successfully)
      if (farcasterInfo.status === 'fulfilled' && farcasterInfo.value?.username) {
        displayName = `@${farcasterInfo.value.username}`;
        isAddress = false;
      } 
      // Then check basename/ENS (if resolved successfully)
      else if (name.status === 'fulfilled' && name.value) {
        displayName = name.value;
        isAddress = false;
      }

      // Set the user info only once with final resolved name
      setConnectedUser({
        address: userAddress,
        displayName,
        farcasterUsername: farcasterInfo.status === 'fulfilled' ? farcasterInfo.value?.username || null : null,
        isResolved: true,
        isAddress
      });

      // Set timeout to clear after 3 seconds
      const newTimeoutId = setTimeout(() => {
        setConnectedUser(null);
      }, 3000);
      setTimeoutId(newTimeoutId);
    } catch (error) {
      console.error('Error fetching identity info:', error);
      // Show formatted address on complete failure
      setConnectedUser({
        address: userAddress,
        displayName: formatAddress(userAddress),
        farcasterUsername: null,
        isResolved: true,
        isAddress: true
      });
    }
  };

  useEffect(() => {
    // Subscribe to wallet connection events
    const unsubscribe = onWalletActivity((userAddress: string, action: WalletActivityAction) => {
      if (action === 'connected') {
        handleNewConnection(userAddress);
      }
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [address, timeoutId]);

  return (
    <AnimatePresence>
      {connectedUser?.isResolved && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`absolute top-full right-0 mt-1 w-full flex items-center justify-end text-sm ${isBaseColors ? "text-foreground/80" : "text-gray-500 dark:text-gray-400"}`}
          style={{ minWidth: '200px' }}
        >
          <div className="flex items-center gap-1 overflow-hidden">
            <span className={`font-medium ${connectedUser.isAddress ? 'font-mono' : ''} max-w-[150px]`}>
              {connectedUser.displayName}
            </span>
            <span className="shrink-0">connected wallet</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}; 