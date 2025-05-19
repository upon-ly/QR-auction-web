import { useState, useEffect, useCallback, useRef } from 'react';

interface TradeActivity {
  id: string;
  message: string;
  txHash?: string;
  timestamp: number;
}

// Track error state globally to avoid repeated retries causing UI thrashing
let lastFetchFailed = false;
let lastFetchTime = 0;
const RETRY_INTERVAL = 30000; // Increased from 10 seconds to 30 seconds between retries after failure

// Global cache to prevent redundant data fetching across components
interface GlobalCache {
  activities: TradeActivity[];
  timestamp: number;
}
let globalActivityCache: GlobalCache | null = null;

// Longer cache expiry - 10 minutes
const CACHE_EXPIRY = 10 * 60 * 1000;

// --- Debug Mode ---
const DEBUG = false;

// Hook that fetches trade activity from our API
export const useTradeActivityApi = (
  onUpdate: (message: string, txHash?: string, messageKey?: string) => void
) => {
  // Track mounted state to avoid memory leaks
  const isMounted = useRef(true);
  // Track processed activities to avoid duplicates
  const processedActivities = useRef(new Set<string>());
  
  // Fetch trade activity data from the API
  const fetchTradeActivity = useCallback(async () => {
    // Don't retry too frequently if previous requests failed
    const now = Date.now();
    if (lastFetchFailed && now - lastFetchTime < RETRY_INTERVAL) {
      if (DEBUG) {
        console.log('Skipping trade activity fetch (throttled after failure)');
      }
      return;
    }
    
    // Check if we have recent cached data
    if (globalActivityCache && now - globalActivityCache.timestamp < CACHE_EXPIRY) {
      if (DEBUG) {
        console.log('Using global cache data', globalActivityCache.activities.length);
      }
      
      // Only process activities we haven't seen before
      globalActivityCache.activities.forEach((activity) => {
        if (!processedActivities.current.has(activity.id)) {
          processedActivities.current.add(activity.id);
          onUpdate(activity.message, activity.txHash, activity.id);
        }
      });
      
      return;
    }
    
    lastFetchTime = now;
    
    try {
      if (DEBUG) {
        console.log('Fetching trade activity...');
      }
      const response = await fetch('/api/trade-activity');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch trade activity: ${response.status}`);
      }
      
      const data = await response.json();
      lastFetchFailed = false;
      
      if (data.activities && Array.isArray(data.activities)) {
        // Check if we actually have activities
        if (data.activities.length === 0) {
          console.log('No trade activities returned from API');
          return;
        }
        
        if (DEBUG) {
          console.log(`Processing ${data.activities.length} trade activities`);
        }
        
        // Update global cache
        globalActivityCache = {
          activities: data.activities,
          timestamp: now
        };
        
        // Sort activities by timestamp (newest first) before processing
        const sortedActivities = [...data.activities].sort((a, b) => {
          // Use timestamps for sorting, newest first
          return b.timestamp - a.timestamp;
        });
        
        // Process newest activities first
        sortedActivities.forEach((activity: TradeActivity) => {
          if (activity.message && activity.id && !processedActivities.current.has(activity.id)) {
            processedActivities.current.add(activity.id);
            if (isMounted.current) {
              onUpdate(activity.message, activity.txHash, activity.id);
            }
          }
        });
      }
    } catch (error) {
      console.error('Error fetching trade activity:', error);
      lastFetchFailed = true;
      
      // Create a fallback message to ensure we have at least one message
      if (lastFetchFailed) {
        onUpdate(
          "Recent $QR purchases will appear here", 
          undefined, 
          `fallback-${Date.now()}`
        );
      }
    }
  }, [onUpdate]);
  
  // Fetch data on mount and with reduced polling frequency
  useEffect(() => {
    // Set mounted flag
    isMounted.current = true;
    
    // Initial fetch with a slight delay to ensure component is mounted
    const initialTimer = setTimeout(() => {
      fetchTradeActivity();
    }, 1000);
    
    // Set up interval for polling - less frequent updates
    const interval = setInterval(() => {
      fetchTradeActivity();
    }, 60000); // Increased from 15 seconds to 60 seconds
    
    // Clean up interval on unmount
    return () => {
      isMounted.current = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchTradeActivity]);
  
  return null;
};

// Hook to fetch token price
export const useTokenPriceApi = () => {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Cache token price values
  const priceCache = useRef<{value: number, timestamp: number} | null>(null);
  // Cache expiry for price - 15 minutes
  const PRICE_CACHE_EXPIRY = 15 * 60 * 1000;
  
  const fetchTokenPrice = useCallback(async () => {
    // Check cache first
    const now = Date.now();
    if (priceCache.current && now - priceCache.current.timestamp < PRICE_CACHE_EXPIRY) {
      setPrice(priceCache.current.value);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('/api/trade-activity');
      
      if (!response.ok) {
        throw new Error('Failed to fetch token price');
      }
      
      const data = await response.json();
      
      if (data.price) {
        setPrice(data.price);
        // Update cache
        priceCache.current = {
          value: data.price,
          timestamp: now
        };
      }
    } catch (error) {
      console.error('Error fetching token price:', error);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchTokenPrice();
    
    const interval = setInterval(() => {
      fetchTokenPrice();
    }, 5 * 60 * 1000); // Increased from every minute to every 5 minutes
    
    return () => clearInterval(interval);
  }, [fetchTokenPrice]);
  
  return { price, loading };
}; 