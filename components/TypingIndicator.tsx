'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { onTyping } from '@/lib/channelManager';
import { useBaseColors } from '@/hooks/useBaseColors';
import { getFarcasterUser } from '@/utils/farcaster';
import { useAccount } from 'wagmi';
import { getName } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';
import { Address } from 'viem';

interface TypingUserInfo {
  address: string;
  displayName: string;
  farcasterUsername: string | null;
  basename: string | null;
}

export const TypingIndicator = () => {
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [typingUserInfo, setTypingUserInfo] = useState<TypingUserInfo | null>(null);
  const isBaseColors = useBaseColors();
  const { address } = useAccount();
  
  // Fetch Farcaster username and basename when the typing user changes
  useEffect(() => {
    if (!typingUser || typingUser.startsWith('anonymous-')) {
      setTypingUserInfo(null);
      return;
    }
    
    // Format address for initial display
    const formatAddress = (addr: string) => {
      return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    };
    
    // Set initial display info while we fetch data
    setTypingUserInfo({
      address: typingUser,
      displayName: formatAddressOrName(typingUser),
      farcasterUsername: null,
      basename: null
    });
    
    // Only attempt to fetch data for Ethereum addresses
    if (typingUser.startsWith('0x') && typingUser.length === 42) {
      const fetchUserData = async () => {
        try {
          // Fetch Farcaster info
          const farcasterInfo = await getFarcasterUser(typingUser);
          
          // Fetch basename
          const baseName = await getName({
            address: typingUser as Address,
            chain: base,
          });
          
          let displayName = formatAddress(typingUser);
          
          // Apply priority: Farcaster > basename > formatted address
          if (farcasterInfo?.username) {
            // Quick temp fix - replace !217978 with softwarecurator
            const username = farcasterInfo.username === "!217978" ? "softwarecurator" : farcasterInfo.username;
            displayName = `@${username}`;
          } else if (baseName) {
            // Quick temp fix - replace !217978 with softwarecurator
            displayName = baseName === "!217978" ? "softwarecurator" : baseName;
          }
          
          setTypingUserInfo({
            address: typingUser,
            displayName,
            farcasterUsername: farcasterInfo?.username === "!217978" ? "softwarecurator" : (farcasterInfo?.username || null),
            basename: baseName === "!217978" ? "softwarecurator" : (baseName || null)
          });
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      };
      
      fetchUserData();
    }
  }, [typingUser]);
  
  useEffect(() => {
    // Subscribe to typing events
    const unsubscribe = onTyping((user, action, source) => {
      console.log('Typing event received:', { user, action, source, currentUser: address });
      
      if (action === 'started-typing') {
        // Don't show our own typing events if we're connected
        if (address && user === address) {
          console.log('Ignoring own typing event');
          return;
        }
        
        console.log('Showing typing indicator for', user);
        setIsTyping(true);
        setTypingUser(user);
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
      return 'Someone';
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

  // Get the display name from typing user info
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