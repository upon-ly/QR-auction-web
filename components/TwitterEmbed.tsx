"use client";

import { useEffect, useRef, useState } from 'react';
import { useBaseColors } from "@/hooks/useBaseColors";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";

interface TwitterEmbedProps {
  tweetUrl: string;
  onError?: () => void;
  showLoader?: boolean;
}

const extractTweetId = (url: string): string => {
  // Extract tweet ID from URL format like: https://x.com/username/status/1234567890123456789
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : '';
};

// Create a global singleton to manage Twitter script loading
const TwitterScriptLoader = {
  isLoaded: false,
  isLoading: false,
  callbacks: [] as (() => void)[],
  
  load() {
    if (this.isLoaded) return Promise.resolve();
    
    if (this.isLoading) {
      return new Promise<void>(resolve => {
        this.callbacks.push(resolve);
      });
    }
    
    this.isLoading = true;
    return new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.onload = () => {
        this.isLoaded = true;
        this.isLoading = false;
        resolve();
        
        // Resolve all pending callbacks
        this.callbacks.forEach(callback => callback());
        this.callbacks = [];
      };
      document.body.appendChild(script);
    });
  }
};

export function TwitterEmbed({ tweetUrl, onError, showLoader = false }: TwitterEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isBaseColors = useBaseColors();
  const { resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const tweetId = extractTweetId(tweetUrl);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!tweetId || !containerRef.current) return;

    const container = containerRef.current;
    setLoading(true);
    
    // Clear the container at the start
    container.innerHTML = '';
    
    // Helper to create a tweet
    const createTweet = async () => {
      try {
        // First load the Twitter script
        await TwitterScriptLoader.load();
        
        // Check if component is still mounted
        if (!mountedRef.current || !container) return;
        
        // Clear the container again right before embedding
        container.innerHTML = '';

        // Determine theme based on system theme and base colors mode
        // Use dark theme only when specifically in dark mode
        const isDarkMode = resolvedTheme === 'dark' && !isBaseColors;
        
        // Create the tweet with full width
        if (window.twttr && window.twttr.widgets) {
          await window.twttr.widgets.createTweet(
            tweetId, 
            container,
            {
              theme: isDarkMode ? 'dark' : 'light',
              conversation: 'none', // Hide the conversation
              width: '100%',
              align: 'center',
              dnt: true
            }
          );
          
          // Apply CSS fix for Twitter's margin
          const tweetContainer = container.querySelector('.twitter-tweet');
          if (tweetContainer) {
            // @ts-expect-error - Twitter's margin is not typed
            tweetContainer.style.marginTop = '0';
          }
        }
      } catch (error) {
        console.error('Error embedding tweet:', error);
        if (onError && mountedRef.current) {
          onError();
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          
          // Additional attempt to fix Twitter's margin after loading
          setTimeout(() => {
            const tweetContainer = container.querySelector('.twitter-tweet');
            if (tweetContainer) {
              // @ts-expect-error - Twitter's margin is not typed
              tweetContainer.style.marginTop = '0';
            }
          }, 100);
        }
      }
    };
    
    // Add a small delay to prevent race conditions
    const timeoutId = setTimeout(createTweet, 100);
    
    return () => {
      clearTimeout(timeoutId);
      container.innerHTML = '';
    };
  }, [tweetId, isBaseColors, resolvedTheme, onError]);

  return (
    <div className={`flex flex-col rounded-xl justify-center items-center w-full overflow-hidden relative ${loading ? 'min-h-[200px]' : ''}`}>
      {loading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}
      <div 
        ref={containerRef} 
        className={`w-full transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`} 
        style={{ 
          width: 'calc(100% - 0px)', 
          maxWidth: '100%', 
          padding: 0, 
          margin: 0,
          boxSizing: 'border-box'
        }}
      />
    </div>
  );
}

// Add TypeScript declaration for the Twitter widget
declare global {
  interface Window {
    twttr: {
      widgets: {
        createTweet: (
          tweetId: string,
          element: HTMLElement,
          options?: {
            theme?: 'light' | 'dark';
            align?: string;
            width?: string | number;
            conversation?: 'none' | 'all';
            dnt?: boolean;
          }
        ) => Promise<HTMLElement>;
      };
    };
  }
} 