import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { initializeChannels, broadcastTyping } from '@/lib/channelManager';
import { v4 as uuidv4 } from 'uuid';

export const useTypingStatus = () => {
  const { address, isConnected } = useAccount();
  const { user } = usePrivy();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialized = useRef(false);
  
  // Generate a unique browser instance ID to track this session
  const browserInstanceIdRef = useRef<string>('');
  const anonymousIdRef = useRef<string>('');
  
  // Get Twitter username from Privy user
  const twitterUsername = useMemo(() => {
    if (user?.linkedAccounts) {
      const twitterAccount = user.linkedAccounts.find((account: { type: string; username?: string }) => account.type === 'twitter_oauth');
      return twitterAccount?.username || null;
    }
    return null;
  }, [user?.linkedAccounts]);
  
  // Initialize channels when hook is first used
  useEffect(() => {
    // Create a unique ID for this browser instance if not already created
    if (!browserInstanceIdRef.current) {
      browserInstanceIdRef.current = uuidv4();
      anonymousIdRef.current = `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
    }
    
    const userId = isConnected && address ? address : anonymousIdRef.current;
    
    if (!initialized.current) {
      console.log('Initializing channels in useTypingStatus');
      initializeChannels(userId, browserInstanceIdRef.current);
      initialized.current = true;
    }
  }, [address, isConnected]);
  
  // Re-initialize when connection state changes
  useEffect(() => {
    if (initialized.current) {
      const userId = isConnected && address ? address : anonymousIdRef.current;
      console.log('Re-initializing channels after connection change');
      initializeChannels(userId, browserInstanceIdRef.current);
    }
  }, [isConnected, address]);
  
  const handleTypingStart = useCallback(() => {
    // Allow anonymous users to broadcast typing events too
    const userId = isConnected && address ? address : anonymousIdRef.current;
    
    // Clear any existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    console.log('Broadcasting typing event for user', userId);
    
    // Use centralized broadcast with browser instance ID and Twitter username if available
    broadcastTyping(userId, 'started-typing', browserInstanceIdRef.current, twitterUsername || undefined);
    
    // Set timeout to clear typing status after inactivity
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(userId, 'stopped-typing', browserInstanceIdRef.current, twitterUsername || undefined);
    }, 5000); // 5 seconds inactivity clears typing status
  }, [address, isConnected, twitterUsername]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);
  
  return { handleTypingStart };
}; 