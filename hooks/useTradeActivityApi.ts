import { useState, useEffect, useCallback } from 'react';

interface TradeActivity {
  id: string;
  message: string;
  txHash?: string;
  timestamp: number;
}

// Track error state globally to avoid repeated retries causing UI thrashing
let lastFetchFailed = false;
let lastFetchTime = 0;
const RETRY_INTERVAL = 10000; // 10 seconds between retries after failure

// --- Debug Mode ---
const DEBUG = false;

// Hook that fetches trade activity from our API
export const useTradeActivityApi = (
  onUpdate: (message: string, txHash?: string, messageKey?: string) => void
) => {
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
        
        // Process each activity and call the update function
        // Sort activities by timestamp (newest first) before processing
        const sortedActivities = [...data.activities].sort((a, b) => {
          // Use timestamps for sorting, newest first
          return b.timestamp - a.timestamp;
        });
        
        // Process newest activities first
        sortedActivities.forEach((activity: TradeActivity) => {
          if (activity.message && activity.id) {
            onUpdate(activity.message, activity.txHash, activity.id);
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
  
  // Fetch data on mount and every 15 seconds
  useEffect(() => {
    // Initial fetch with a slight delay to ensure component is mounted
    const initialTimer = setTimeout(() => {
      fetchTradeActivity();
    }, 1000);
    
    // Set up interval for polling - more frequent updates
    const interval = setInterval(() => {
      fetchTradeActivity();
    }, 15000); // Every 15 seconds
    
    // Clean up interval on unmount
    return () => {
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
  
  const fetchTokenPrice = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/trade-activity');
      
      if (!response.ok) {
        throw new Error('Failed to fetch token price');
      }
      
      const data = await response.json();
      
      if (data.price) {
        setPrice(data.price);
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
    }, 60000); // Every minute
    
    return () => clearInterval(interval);
  }, [fetchTokenPrice]);
  
  return { price, loading };
}; 