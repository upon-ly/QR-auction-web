'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onConnection } from '@/lib/channelManager';
import { useBaseColors } from '@/hooks/useBaseColors';
import { getFarcasterUser } from '@/utils/farcaster';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';

interface ConnectedUserInfo {
  address: string;
  displayName: string;
  farcasterUsername: string | null;
  timestamp: number;
}

export const ConnectionIndicator = () => {
  const [connectedUser, setConnectedUser] = useState<ConnectedUserInfo | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);
  const previousAddressRef = useRef<string | null>(null);
  const isBaseColors = useBaseColors();
  const { address } = useAccount();
  const { authenticated, ready } = usePrivy();
  
  // Set up the mounted ref to track component lifecycle
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  // Clear the timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
  
  // Track wallet connection directly from useAccount changes
  useEffect(() => {
    const handleWalletChange = async () => {
      // Only process connections when Privy confirms the user is authenticated
      if (ready && authenticated && address && address !== previousAddressRef.current) {
        console.log('Wallet address changed/connected:', address);
        previousAddressRef.current = address;
        
        // Handle wallet connection as if it were a connection event
        await handleConnection(address);
      } else if (!authenticated) {
        // If user is not authenticated, clear any displayed connection
        if (connectedUser) {
          setConnectedUser(null);
          previousAddressRef.current = null;
        }
      }
    };
    
    handleWalletChange();
  }, [address, authenticated, ready, connectedUser]);
  
  // Fetch Farcaster username when a user connects
  const handleConnection = async (userAddress: string) => {
    // Only process connections when Privy confirms the user is authenticated
    if (!authenticated) {
      console.log('Connection event ignored - user not authenticated');
      return;
    }
    
    // Removed the condition to hide our own connection events
    console.log('Connection event received from', userAddress);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Set basic user info with formatted address
    setConnectedUser({
      address: userAddress,
      displayName: formatAddressOrName(userAddress),
      farcasterUsername: null,
      timestamp: Date.now()
    });
    
    // Attempt to fetch Farcaster info if it's an Ethereum address
    if (userAddress.startsWith('0x') && userAddress.length === 42) {
      try {
        const farcasterInfo = await getFarcasterUser(userAddress);
        
        // Only update if component is still mounted and this is still the same user being shown
        if (mountedRef.current) {
          if (farcasterInfo) {
            setConnectedUser((prev) => {
              // Only update if this is still the same user being shown
              if (prev && prev.address === userAddress) {
                return {
                  ...prev,
                  displayName: `@${farcasterInfo.username}`,
                  farcasterUsername: farcasterInfo.username
                };
              }
              return prev;
            });
          }
        }
      } catch (error) {
        console.error('Error fetching Farcaster info:', error);
      }
    }
    
    // Set timeout to hide after 4 seconds
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setConnectedUser(null);
      }
    }, 4000);
  };
  
  useEffect(() => {
    // Only subscribe to connection events if user is authenticated
    if (!authenticated) {
      return () => {}; // Return empty cleanup function if not authenticated
    }
    
    // Subscribe to connection events
    const unsubscribe = onConnection((userAddress) => {
      handleConnection(userAddress);
    });
    
    // Cleanup subscription on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [authenticated]); // Depend on authenticated state
  
  // Format address or name
  const formatAddressOrName = (address: string) => {
    if (!address) return '';
    
    // Check if the address contains ".eth" (ENS name)
    if (address.includes('.eth')) {
      return address;
    }
    
    // Otherwise format as a wallet address
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };
  
  // Don't render anything if no one has connected or user is not authenticated
  if (!connectedUser || !authenticated) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ 
          opacity: 1, 
          y: 0
        }}
        transition={{
          duration: 0.2,
          ease: "easeOut"
        }}
        exit={{ opacity: 0, y: -5 }}
        className={`text-xs whitespace-nowrap ${
          isBaseColors 
            ? "text-foreground/80" 
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        <span className="font-medium">{connectedUser.displayName}</span>
        <span className="ml-1">connected wallet 👋</span>
      </motion.div>
    </AnimatePresence>
  );
}; 