"use client";

import { useEffect, useRef, useState } from 'react';
import { useBaseColors } from "@/hooks/useBaseColors";

interface TwitterEmbedProps {
  tweetUrl: string;
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

export function TwitterEmbed({ tweetUrl }: TwitterEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isBaseColors = useBaseColors();
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
        
        // Create the tweet
        if (window.twttr && window.twttr.widgets) {
          await window.twttr.widgets.createTweet(
            tweetId, 
            container,
            {
              theme: 'light', // Always use light mode for consistency
              conversation: 'none', // Hide the conversation
              width: '100%',
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
  }, [tweetId, isBaseColors]);

  return (
    <div className="flex flex-col rounded-md justify-center items-center w-full md:w-[376px] overflow-hidden bg-white">
      {loading && (
        <div className="flex items-center justify-center h-[200px] w-full">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="w-full min-h-[100px] [&_.twitter-tweet]:!mt-0" // Use !important on any twitter-tweet element inside
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
          }
        ) => Promise<HTMLElement>;
      };
    };
  }
} 