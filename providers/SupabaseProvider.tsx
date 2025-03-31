'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { initializeChannels, cleanupChannels, broadcastConnection } from '@/lib/channelManager';
import { v4 as uuidv4 } from 'uuid';

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const browserInstanceIdRef = useRef<string>('');
  const initialized = useRef(false);
  const wasConnectedRef = useRef(false);

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
  
  // Handle visibility changes to ensure connection is maintained
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && initialized.current) {
        // Re-initialize channels when tab becomes visible after being hidden
        const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
        console.log('SupabaseProvider: Tab became visible, re-initializing channels for', userId);
        initializeChannels(userId, browserInstanceIdRef.current);
      }
    };
    
    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [address, isConnected]);
  
  // Broadcast wallet connection event when a user connects
  useEffect(() => {
    // Only broadcast if the wallet was just connected (not on initial render)
    if (isConnected && address && initialized.current && !wasConnectedRef.current) {
      console.log('SupabaseProvider: Broadcasting wallet connection for', address);
      broadcastConnection(address, browserInstanceIdRef.current);
    }
    
    // Update the connection state reference
    wasConnectedRef.current = isConnected && !!address;
  }, [isConnected, address]);
  
  return <>{children}</>;
} 