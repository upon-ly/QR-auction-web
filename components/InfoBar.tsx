'use client'

import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useAccount } from 'wagmi'; 
// import { initializeChannels } from '@/lib/channelManager';
import { useTradeActivityApi } from '@/hooks/useTradeActivityApi';
import { useTokenPrice } from '@/hooks/useTokenPrice';
import { ExternalLink, ArrowRightLeft } from 'lucide-react';
import { useBaseColors } from '@/hooks/useBaseColors';
import { useTheme } from 'next-themes';
import clsx from 'clsx';
import { useCryptoTicker } from '@/hooks/useCryptoTicker';

// Get TokenPrice type from useCryptoTicker hook
interface TokenPrice {
  symbol: string;
  price: number;
  priceChange24h: number;
  color: string;
}

type InfoUpdate = {
  id: string;
  message: string;
  timestamp: number;
  txHash?: string;
  local?: boolean;
  eventType: 'trade';
  showCount: number; // Track how many times it's been shown
};

// Debug mode - set to true for verbose logging
const DEBUG = false;

// Store a browser instance ID to distinguish between local and remote events
// const BROWSER_INSTANCE_ID = Math.random().toString(36).substring(2, 15);
// OPTIMIZATION: Longer cleanup intervals to reduce resources
// Keep more updates in history for variety, but clean them up less frequently
const MAX_UPDATES = 20; // Increased from 15
const CLEANUP_INTERVAL = 2 * 60 * 1000; // Every 2 minutes instead of 30 seconds

// COMPLETELY SEPARATE PRICE TICKER COMPONENT
// This is a fully independent component that won't re-render when trade activity changes
const PriceTicker = memo(() => {
  const { tokens, loading: tokensLoading } = useCryptoTicker();
  const [stableTokens, setStableTokens] = useState<TokenPrice[]>([]);
  const [lastTokenUpdate, setLastTokenUpdate] = useState(0);
  const TOKEN_CACHE_DURATION = 15000; // 15 seconds cache
  
  // Update stable tokens only every 15 seconds
  useEffect(() => {
    const now = Date.now();
    if (
      tokens.length > 0 && 
      (stableTokens.length === 0 || now - lastTokenUpdate >= TOKEN_CACHE_DURATION)
    ) {
      setStableTokens(tokens);
      setLastTokenUpdate(now);
    }
  }, [tokens, stableTokens, lastTokenUpdate]);
  
  // Format crypto price with the right number of decimals
  const formatCryptoPrice = (price: number) => {
    if (price >= 1000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
      }).format(price);
    } else if (price >= 1) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
      }).format(price);
    } else if (price < 0.0001) {
      // For very small prices, use subscript notation like $0.0₆6777
      const priceStr = price.toFixed(12);
      const match = priceStr.match(/0\.0*(\d+)/);
      
      if (match) {
        const leadingZeros = priceStr.match(/0\.(0*)/)?.[1] || '';
        const zeroCount = leadingZeros.length;
        const significantDigits = match[1].substring(0, 4); // Show first 4 significant digits
        
        // Convert number to subscript using Unicode subscript characters
        const subscriptMap: Record<string, string> = {
          '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
          '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
        };
        const subscriptCount = zeroCount.toString().split('').map(d => subscriptMap[d]).join('');
        
        return `$0.0${subscriptCount}${significantDigits}`;
      }
      
      // Fallback to standard formatting
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 8
      }).format(price);
    } else {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 4
      }).format(price);
    }
  };
  
  // Format price change percentage
  const formatPriceChange = (change: number) => {
    return `${Math.abs(change).toFixed(2)}%`;
  };

  // Triangular arrow components
  const UpTriangle = () => (
    <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#00FF00] mx-0.5" style={{ marginBottom: '1px' }} />
  );

  const DownTriangle = () => (
    <span className="inline-block w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#FF0000] mx-0.5" style={{ marginTop: '1px' }} />
  );
  
  // Use stable tokens to prevent animation resets
  const displayTokens = stableTokens.length > 0 ? stableTokens : tokens;
  
  if (tokensLoading && displayTokens.length === 0) {
    return (
      <div className="flex w-full h-full items-center justify-start pl-4">
        <span className="text-gray-400 text-sm">Loading crypto prices...</span>
      </div>
    );
  }
  
  // Create duplicate tokens array for smoother looping
  const renderedTokens = [...displayTokens, ...displayTokens]; // Duplicate tokens for seamless loop
  
  return (
    <div className="relative flex overflow-x-hidden w-full marquee-container pr-[120px]">
      {/* Using a direct div for crypto ticker to keep animation stable */}
      <div 
        className="animate-marquee whitespace-nowrap h-full flex items-center"
        style={{ 
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          animationDuration: '45s'
        }}
      >
        {renderedTokens.map((token, index) => (
          <React.Fragment key={`${token.symbol}-${index}`}>
            <span className="mx-4 font-medium inline-flex items-center" style={{ color: token.color }}>
              {token.symbol} {formatCryptoPrice(token.price)}
              {token.priceChange24h !== 0 && (
                <span className="flex items-center ml-1.5" style={{ color: token.priceChange24h >= 0 ? '#00FF00' : '#FF0000' }}>
                  {token.priceChange24h >= 0 ? <UpTriangle /> : <DownTriangle />}
                  {formatPriceChange(token.priceChange24h)}
                </span>
              )}
            </span>
            <span className="text-gray-500 mx-2">|</span>
          </React.Fragment>
        ))}
      </div>
      
      <div 
        className="absolute top-0 animate-marquee2 whitespace-nowrap h-full flex items-center"
        style={{ 
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          animationDuration: '45s'
        }}
      >
        {renderedTokens.map((token, index) => (
          <React.Fragment key={`clone-${token.symbol}-${index}`}>
            <span className="mx-4 font-medium inline-flex items-center" style={{ color: token.color }}>
              {token.symbol} {formatCryptoPrice(token.price)}
              {token.priceChange24h !== 0 && (
                <span className="flex items-center ml-1.5" style={{ color: token.priceChange24h >= 0 ? '#00FF00' : '#FF0000' }}>
                  {token.priceChange24h >= 0 ? <UpTriangle /> : <DownTriangle />}
                  {formatPriceChange(token.priceChange24h)}
                </span>
              )}
            </span>
            <span className="text-gray-500 mx-2">|</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
});

PriceTicker.displayName = 'PriceTicker';

export const useInfoBarUpdates = () => {
  const [updates, setUpdates] = useState<InfoUpdate[]>([]);
  const { address, isConnected } = useAccount();
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Add update to the list
  const addUpdate = useCallback((message: string, txHash?: string, messageKey?: string) => {
    if (DEBUG) {
      console.log(`Adding/updating trade info:`, message, txHash ? `(tx: ${txHash})` : '', messageKey ? `(key: ${messageKey})` : '');
    }
    
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
          if (DEBUG) {
            console.log('Replacing existing message with updated version:', message);
          }
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
        if (DEBUG) {
          console.log('Duplicate message detected, skipping:', message);
        }
        return prev;
      }
      
      // Keep only last MAX_UPDATES updates
      const newUpdates = [update, ...prev];
      if (newUpdates.length > MAX_UPDATES) {
        return newUpdates.slice(0, MAX_UPDATES);
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
      
      // If we have 15 or fewer updates, keep them all regardless of age
      if (updatedMessages.length <= 15) {
        return updatedMessages;
      }
      
      // Sort by freshness (newest first) to ensure we always keep the freshest 15
      const sortedMessages = [...updatedMessages].sort((a, b) => b.timestamp - a.timestamp);
      
      // Keep the 15 freshest messages and any that are less than 15 seconds old
      const filteredMessages = sortedMessages.filter((update, index) => {
        // Always keep the 15 freshest messages
        if (index < 15) return true;
        
        // Also keep any other messages that are recent
        return now - update.timestamp < 15000;
      });
      
      return filteredMessages;
    });
  }, []);
  
  // Set up Supabase Realtime channel (only for initialization purposes)
  useEffect(() => {
    if (!isConnected || !address) return;
    
    if (DEBUG) {
      console.log('Setting up InfoBar channels for user:', address);
    }
    
    // Initialize channels via the manager (still needed for wallet connections elsewhere)
    // initializeChannels(address, BROWSER_INSTANCE_ID);
    
    // Set up interval to clean old updates
    if (cleanupInterval.current) {
      clearInterval(cleanupInterval.current);
    }
    
    // OPTIMIZATION: Less frequent cleanup to reduce unnecessary operations
    cleanupInterval.current = setInterval(cleanupOldUpdates, CLEANUP_INTERVAL);
    
    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
    };
  }, [isConnected, address, cleanupOldUpdates]);
  
  // Add trade activity updates
  useTradeActivityApi(addUpdate);
  
  return { updates };
};

export const InfoBar: React.FC = () => {
  const { updates } = useInfoBarUpdates();
  const { formatMarketCap } = useTokenPrice();
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeCloneRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const isBaseColors = useBaseColors();
  const { theme } = useTheme();
  
  // Common styles for the InfoBar
  // Added important z-index values and improved mobile specificity
  const baseStyles = `fixed left-0 right-0 bg-black text-white border-b border-gray-700 shadow-md overflow-hidden h-8 flex items-center w-full`;
  const topBarStyles = `${baseStyles} z-[9999] top-0`; // Ensure top-0 is set explicitly
  const bottomBarStyles = `${baseStyles} z-[9998] top-8`; // Slightly lower z-index than top bar
  
  // Calculate animation duration based on content width to maintain consistent speed
  useEffect(() => {
    try {
      if (!marqueeRef.current || !marqueeCloneRef.current || updates.length === 0) return;
      
      // Base animation duration for 5 items (25s from CSS)
      const baseDuration = 25;
      
      // This helps maintain consistent speed regardless of content length
      // We calculate what the width would be with 5 items
      const baseItemCount = 5;
      const itemRatio = updates.length / baseItemCount;
      
      // Calculate adjusted duration based on ratio of actual items to base items
      // This ensures animation appears at same speed regardless of item count
      const adjustedDuration = baseDuration * itemRatio;
      
      // Apply the calculated duration
      marqueeRef.current.style.animationDuration = `${adjustedDuration}s`;
      marqueeCloneRef.current.style.animationDuration = `${adjustedDuration}s`;
    } catch (error) {
      console.error('Error setting trade ticker animation duration:', error);
    }
  }, [updates.length]);

  // Always render the market cap section, even with no updates
  const marketCapSection = (
    <div className="absolute right-0 top-0 h-full flex items-center" style={{ zIndex: 9999 }}>
      {/* Higher Tooltip - Theme-aware */}
      <div 
        className={clsx(
          'h-8 flex items-center gap-2 transition-opacity duration-200 px-3',
          showTooltip ? 'opacity-100' : 'opacity-0 pointer-events-none',
          {
            // Base Colors theme
            'bg-background border-l border-primary/20 text-foreground': isBaseColors,
            // Dark theme
            'bg-zinc-800 border-l border-zinc-700 text-white': !isBaseColors && theme === 'dark',
            // Light theme (default)
            'bg-white border-l border-gray-200 text-gray-900': !isBaseColors && theme !== 'dark'
          }
        )}
        style={{ 
          top: '0',
          right: '185px',
          zIndex: 99999
        }}
      >
        <img 
          src="https://basescan.org/token/images/higher_32.png" 
          alt="Higher" 
          width="20" 
          height="20"
          className="w-5 h-5 rounded-full" 
        />
        <span className={clsx(
          'text-sm font-medium',
          {
            'text-foreground': isBaseColors,
            'text-white': !isBaseColors && theme === 'dark',
            'text-gray-900': !isBaseColors && theme !== 'dark'
          }
        )}>higher.</span>
      </div>
      
      {/* Market cap with hover functionality */}
      <a 
        href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
        target="_blank"
        rel="noopener noreferrer"
        className="h-full flex items-center bg-black px-4 border-l border-gray-700 hover:bg-black/80 transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="flex items-center text-white">
          {formatMarketCap()}
          <ExternalLink className="ml-1.5 h-3 w-3 opacity-50 hover:opacity-100 transition-opacity" />
        </div>
      </a>
    </div>
  );
    
  // If no updates, still render both tickers but with fallback message for QR events
  if (updates.length === 0) {
    return (
      <div className="flex flex-col">
        {/* Crypto price ticker - on top */}
        <div className={topBarStyles}>
          <PriceTicker />
        </div>
        
        {/* Trade activity ticker - below */}
        <div className={bottomBarStyles}>
          <div className="flex w-full h-full items-center justify-start pl-4">
            <span className="text-gray-400 text-sm">
              Loading trade activity...
            </span>
          </div>
          {marketCapSection}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col">
      {/* Crypto price ticker - on top */}
      <div className={topBarStyles}>
        <PriceTicker />
      </div>
      
      {/* Trade activity ticker - below */}
      <div className={bottomBarStyles}>
        <div className="relative flex overflow-x-hidden w-full marquee-container pr-[120px]">
          <div 
            ref={marqueeRef} 
            className="animate-marquee whitespace-nowrap h-full flex items-center"
            style={{ 
              transform: 'translateZ(0)',
              willChange: 'transform',
              backfaceVisibility: 'hidden'
            }}
          >
            {updates.map((update) => (
              <React.Fragment key={update.id}>
                <span className="mx-4 font-medium inline-flex items-center text-[#00FF00]">
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
                <span className="text-gray-500 mx-2">|</span>
              </React.Fragment>
            ))}
          </div>
          
          <div 
            ref={marqueeCloneRef} 
            className="absolute top-0 animate-marquee2 whitespace-nowrap h-full flex items-center"
            style={{ 
              transform: 'translateZ(0)',
              willChange: 'transform',
              backfaceVisibility: 'hidden'
            }}
          >
            {updates.map((update) => (
              <React.Fragment key={`clone-${update.id}`}>
                <span className="mx-4 font-medium inline-flex items-center text-[#00FF00]">
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
                <span className="text-gray-500 mx-2">|</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        
        {marketCapSection}
      </div>
    </div>
  );
};