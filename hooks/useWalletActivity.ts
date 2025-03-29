import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { initializeChannels, broadcastWalletActivity } from '@/lib/channelManager';
import { v4 as uuidv4 } from 'uuid';

export const useWalletActivity = () => {
  const { address, isConnected } = useAccount();
  const initialized = useRef(false);
  const browserInstanceIdRef = useRef<string>('');
  const lastConnectedRef = useRef<boolean>(false);
  
  // Initialize channels when hook is first used
  useEffect(() => {
    if (!browserInstanceIdRef.current) {
      browserInstanceIdRef.current = uuidv4();
    }
    
    if (!initialized.current) {
      console.log('Initializing channels for wallet activity');
      initializeChannels(address || browserInstanceIdRef.current, browserInstanceIdRef.current);
      initialized.current = true;
    }
  }, [address]);

  // Broadcast wallet connection when status changes
  useEffect(() => {
    // Only broadcast if we've just connected and weren't connected before
    if (isConnected && address && !lastConnectedRef.current) {
      console.log('Broadcasting wallet connection:', address);
      broadcastWalletActivity(address, 'connected', browserInstanceIdRef.current);
    }
    
    // Update last connected state
    lastConnectedRef.current = isConnected;
  }, [isConnected, address]);

  return { isConnected };
}; 