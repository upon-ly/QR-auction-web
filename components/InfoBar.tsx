'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi'; 
// import { initializeChannels } from '@/lib/channelManager';
import { useTradeActivity } from '@/hooks/useTradeActivity';
import { useTokenPrice } from '@/hooks/useTokenPrice';
import { ExternalLink, ArrowRightLeft } from 'lucide-react';

type InfoUpdate = {
  id: string;
  message: string;
  timestamp: number;
  txHash?: string;
  local?: boolean;
  eventType: 'trade';
  showCount: number; // Track how many times it's been shown
};

// Store a browser instance ID to distinguish between local and remote events
// const BROWSER_INSTANCE_ID = Math.random().toString(36).substring(2, 15);

export const useInfoBarUpdates = () => {
  const [updates, setUpdates] = useState<InfoUpdate[]>([]);
  const { address, isConnected } = useAccount();
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Add update to the list
  const addUpdate = useCallback((message: string, txHash?: string, messageKey?: string) => {
    console.log(`Adding/updating trade info:`, message, txHash ? `(tx: ${txHash})` : '', messageKey ? `(key: ${messageKey})` : '');
    
    // Create a unique ID based on provided messageKey or the message content
    const messageId = messageKey || (message.replace(/\s+/g, '-').toLowerCase() + '-' + Date.now().toString().slice(-4));
    
    const update: InfoUpdate = {
      id: messageId,
      message,
      timestamp: Date.now(),
      txHash,
      local: false,
      eventType: 'trade',
      showCount: 0
    };
    
    setUpdates(prev => {
      // If this message has a messageKey that matches an existing ID, always replace it
      if (messageKey) {
        const existingIndex = prev.findIndex(item => item.id === messageKey);
        if (existingIndex >= 0) {
          console.log('Replacing existing message with updated version:', message);
          const newUpdates = [...prev];
          
          // Keep the original timestamp but update the message content and reset show count
          newUpdates[existingIndex] = {
            ...newUpdates[existingIndex],
            message,
            txHash,
            showCount: 0 // Reset show count so this updated version stays longer
          };
          return newUpdates;
        }
      }
      
      // Check if this is a duplicate message (same content in last 5 seconds without messageKey)
      const isDuplicate = prev.some(item => 
        (!messageKey && item.message === message && Date.now() - item.timestamp < 5000)
      );
      
      if (isDuplicate) {
        console.log('Duplicate message detected, skipping:', message);
        return prev;
      }
      
      // Keep only last 5 updates, more ephemeral
      const newUpdates = [update, ...prev];
      if (newUpdates.length > 5) {
        return newUpdates.slice(0, 5);
      }
      return newUpdates;
    });
  }, []);

  // Clean up old updates or those shown too many times
  const cleanupOldUpdates = useCallback(() => {
    const now = Date.now();
    
    setUpdates(prev => {
      // Increment show count for all messages
      const updatedMessages = prev.map(update => ({
        ...update,
        showCount: update.showCount + 1
      }));
      
      // If we have 5 or fewer updates, keep them all regardless of age
      if (updatedMessages.length <= 5) {
        return updatedMessages;
      }
      
      // Sort by freshness (newest first) to ensure we always keep the freshest 5
      const sortedMessages = [...updatedMessages].sort((a, b) => b.timestamp - a.timestamp);
      
      // Keep the 5 freshest messages and any that are less than 15 seconds old
      const filteredMessages = sortedMessages.filter((update, index) => {
        // Always keep the 5 freshest messages
        if (index < 5) return true;
        
        // Also keep any other messages that are recent
        return now - update.timestamp < 15000;
      });
      
      return filteredMessages;
    });
  }, []);
  
  // Set up Supabase Realtime channel (only for initialization purposes)
  useEffect(() => {
    if (!isConnected || !address) return;
    
    console.log('Setting up InfoBar channels for user:', address);
    
    // Initialize channels via the manager (still needed for wallet connections elsewhere)
    // initializeChannels(address, BROWSER_INSTANCE_ID);
    
    // Set up cleanup interval for old updates
    cleanupInterval.current = setInterval(cleanupOldUpdates, 5000);
    
    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
    };
  }, [isConnected, address, cleanupOldUpdates]);
  
  // Add trade activity updates
  useTradeActivity(addUpdate);
  
  return { updates };
};

export const InfoBar: React.FC = () => {
  const { updates } = useInfoBarUpdates();
  const { formatMarketCap } = useTokenPrice();
  
  // Common styles for the InfoBar
  const baseStyles = `fixed left-0 right-0 z-[9999] bg-black text-white border-b border-gray-700 shadow-md overflow-hidden h-8 flex items-center`;
  
  // Only render content if we have updates
  if (updates.length === 0) {
    return <div className={baseStyles} />;
  }
  
  return (
    <div className={baseStyles}>
      <div className="relative flex overflow-x-hidden w-full marquee-container pr-[120px]">
        <div className="animate-marquee whitespace-nowrap px-4 h-full flex items-center">
          {updates.map((update, index) => (
            <React.Fragment key={update.id}>
              <span className="mx-4 font-medium flex items-center text-green-400">
                <ArrowRightLeft className="mr-1" size={14} />
                {update.message}
                {update.txHash && (
                  <a 
                    href={`https://basescan.org/tx/${update.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block ml-1 align-text-bottom"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={14} className="inline" />
                  </a>
                )}
              </span>
              {index < updates.length - 1 && (
                <div className="inline-block mx-2 h-8 w-0.5 bg-gray-600 align-middle" style={{ marginTop: -2 }} />
              )}
            </React.Fragment>
          ))}
        </div>
        
        <div className="absolute top-0 animate-marquee2 whitespace-nowrap px-4 h-full flex items-center">
          {updates.map((update, index) => (
            <React.Fragment key={`clone-${update.id}`}>
              <span className="mx-4 font-medium inline-flex items-center text-green-400">
                <ArrowRightLeft className="mr-1" size={14} />
                {update.message}
                {update.txHash && (
                  <a 
                    href={`https://basescan.org/tx/${update.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block ml-1 align-text-bottom"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={14} className="inline" />
                  </a>
                )}
              </span>
              {index < updates.length - 1 && (
                <div className="inline-block mx-2 h-8 w-0.5 bg-gray-600 align-middle" style={{ marginTop: -2 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      
      {/* Market Cap Display */}
      <div className="absolute right-0 top-0 h-full flex items-center bg-black px-4 border-l border-gray-700 whitespace-nowrap z-20">
        <span className="text-white">{formatMarketCap()}</span>
      </div>
    </div>
  );
}; 