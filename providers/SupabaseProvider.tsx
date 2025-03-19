'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { initializeChannels, cleanupChannels } from '@/lib/channelManager';
import { v4 as uuidv4 } from 'uuid';

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const browserInstanceIdRef = useRef<string>('');
  const initialized = useRef(false);

  // Initialize channels on component mount, even if user isn't connected
  useEffect(() => {
    // Create a unique ID for this browser instance if not already created
    if (!browserInstanceIdRef.current) {
      browserInstanceIdRef.current = uuidv4();
    }
    
    const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
    
    if (!initialized.current) {
      console.log('SupabaseProvider: Initializing channels for user', userId);
      initializeChannels(userId, browserInstanceIdRef.current);
      initialized.current = true;
      
      return () => {
        console.log('SupabaseProvider: Cleaning up channels');
        cleanupChannels();
        initialized.current = false;
      };
    }
  }, [address, isConnected]);
  
  // Re-initialize if the connection state changes
  useEffect(() => {
    if (initialized.current) {
      const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
      console.log('SupabaseProvider: Re-initializing channels after connection change for', userId);
      initializeChannels(userId, browserInstanceIdRef.current);
    }
  }, [isConnected, address]);
  
  return <>{children}</>;
} 