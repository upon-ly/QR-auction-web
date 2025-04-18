"use client";

import { useState, useEffect } from 'react';
import { Tweet } from 'react-tweet';
import { Loader2 } from 'lucide-react';
import { useBaseColors } from '@/hooks/useBaseColors';

interface TweetEmbedProps {
  tweetUrl: string;
  onError?: () => void;
  showLoader?: boolean;
  onClick?: () => void;
}

// Extract the tweet ID from a Twitter URL
const extractTweetId = (url: string): string => {
  // Handles URLs like https://twitter.com/username/status/1234567890123456789
  // or https://x.com/username/status/1234567890123456789
  const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/);
  return match ? match[1] : '';
};

export function TweetEmbed({ tweetUrl, onError, showLoader = false, onClick }: TweetEmbedProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tweetId, setTweetId] = useState('');
  const isBaseColors = useBaseColors();

  useEffect(() => {
    setLoading(true);
    setError(false);
    
    // Extract the tweet ID from the URL
    const id = extractTweetId(tweetUrl);
    setTweetId(id);
    
    // If we couldn't extract a valid ID, trigger an error
    if (!id) {
      console.error('Invalid tweet URL:', tweetUrl);
      setError(true);
      if (onError) onError();
    }
    
    // Simulate a minimum loading time to prevent flashing
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [tweetUrl, onError]);

  const handleTweetClick = () => {
    if (onClick) {
      onClick();
    } else if (tweetUrl) {
      window.open(tweetUrl, '_blank');
    }
  };

  if (error) {
    return null;
  }

  return (
    <div 
      className={`w-full transition-opacity duration-300 relative rounded-xl overflow-hidden ${loading ? 'min-h-[200px]' : ''} ${onClick ? 'cursor-pointer' : ''}`}
      data-theme={isBaseColors ? "light" : undefined}
      onClick={handleTweetClick}
      style={{ margin: 0, padding: 0 }}
    >
      {loading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}
      
      <div className={`w-full transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`} style={{ margin: 0, padding: 0 }}>
        {tweetId && (
          <Tweet id={tweetId} onError={() => {
            setError(true);
            if (onError) onError();
          }} />
        )}
      </div>
    </div>
  );
} 