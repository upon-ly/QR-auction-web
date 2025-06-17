'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { onTyping } from '@/lib/channelManager';
import { useBaseColors } from '@/hooks/useBaseColors';
import { getFarcasterUser } from '@/utils/farcaster';
import { useAccount } from 'wagmi';

interface TypingUserInfo {
  address: string;
  displayName: string;
  farcasterUsername: string | null;
  twitterUsername: string | null;
}

export const TypingIndicator = () => {
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [typingUserInfo, setTypingUserInfo] = useState<TypingUserInfo | null>(null);
  const isBaseColors = useBaseColors();
  const { address } = useAccount();
  
  // Fetch Farcaster username when the typing user changes (only if no Twitter username)
  useEffect(() => {
    if (!typingUser || typingUser.startsWith('anonymous-')) {
      setTypingUserInfo(null);
      return;
    }
    
    // Check if we already have Twitter username from the typing event
    if (typingUserInfo?.twitterUsername) {
      // Skip Farcaster fetch if Twitter username is already available
      return;
    }
    
    // Set initial display info while we fetch Farcaster data
    if (!typingUserInfo) {
      setTypingUserInfo({
        address: typingUser,
        displayName: formatAddressOrName(typingUser),
        farcasterUsername: null,
        twitterUsername: null
      });
    }
    
    // Only attempt to fetch Farcaster data for Ethereum addresses when no Twitter username
    if (typingUser.startsWith('0x') && typingUser.length === 42 && !typingUserInfo?.twitterUsername) {
      const fetchFarcasterInfo = async () => {
        try {
          const farcasterInfo = await getFarcasterUser(typingUser);
          
          if (farcasterInfo) {
            setTypingUserInfo(prev => ({
              ...prev!,
              address: typingUser,
              displayName: prev?.twitterUsername ? `@${prev.twitterUsername}` : `@${farcasterInfo.username}`,
              farcasterUsername: farcasterInfo.username
            }));
          }
        } catch (error) {
          console.error('Error fetching Farcaster info:', error);
        }
      };
      
      fetchFarcasterInfo();
    }
  }, [typingUser, typingUserInfo?.twitterUsername]);
  
  useEffect(() => {
    // Subscribe to typing events
    const unsubscribe = onTyping((user, action, source, username) => {
      if (action === 'started-typing') {
        // Don't show our own typing events if we're connected
        if (address && user === address) {
          console.log('Ignoring own typing event');
          return;
        }
        
        console.log('Showing typing indicator for', user);
        setIsTyping(true);
        setTypingUser(user);
        
        // If username is provided from Privy auth (Twitter or Farcaster), store it
        if (username) {
          setTypingUserInfo({
            address: user,
            displayName: `@${username}`,
            farcasterUsername: null,
            twitterUsername: username // This will be Twitter username due to priority in useTypingStatus
          });
        }
      } else if (action === 'stopped-typing') {
        if (user === typingUser) {
          console.log('Hiding typing indicator for', user);
          setIsTyping(false);
          setTypingUser(null);
          setTypingUserInfo(null);
        }
      }
    });
    
    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, [typingUser, address]);
  
  // Format address or name
  const formatAddressOrName = (address: string) => {
    if (!address) return '';
    
    // If it's an anonymous user, don't show the address
    if (address.startsWith('anonymous-')) {
      return 'someone';
    }
    
    // Check if the address contains ".eth" (ENS name)
    if (address.includes('.eth')) {
      return address;
    }
    
    // Check if it's a farcaster username (starts with @)
    if (address.startsWith('@')) {
      return address;
    }
    
    // Otherwise format as a wallet address
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };
  
  // Don't render anything if no one is typing
  if (!isTyping || !typingUser) {
    return null;
  }

  // Get the display name, prioritizing Farcaster username
  const displayName = typingUserInfo?.displayName || 
                      formatAddressOrName(typingUser);

  return (
    <div className={`flex items-center text-xs whitespace-nowrap ${isBaseColors ? "text-foreground/80" : "text-gray-500 dark:text-gray-400"} overflow-visible`}>
      <span className="truncate">{displayName}</span>
      <span className="mx-1 flex-shrink-0">is bidding</span>
      <div className="flex items-center flex-shrink-0">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`w-1.5 h-1.5 mx-0.5 rounded-full ${isBaseColors ? "bg-primary/80" : "bg-gray-400 dark:bg-gray-500"}`}
            animate={{
              scale: [1, 1.3, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              repeatType: "loop",
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </div>
  );
}; 