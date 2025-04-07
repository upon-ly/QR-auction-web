import { useState, useEffect, useCallback } from 'react';

interface TradeActivity {
  id: string;
  message: string;
  txHash: string;
  trader: string;
  amountRaw: number;
  timestamp: number;
}

interface TradeActivityResponse {
  activities: TradeActivity[];
  timestamp: number;
  price: number | null;
}

export const useTradeActivityApi = (callback: (message: string, txHash?: string, messageKey?: string) => void) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Fetch trade activity from the API
  const fetchTradeActivity = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/trade-activity');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: TradeActivityResponse = await response.json();
      
      // Process activities and send them to callback
      data.activities.forEach(activity => {
        callback(activity.message, activity.txHash, activity.id);
      });
      
      return data;
    } catch (error) {
      console.error('Error fetching trade activity:', error);
      setError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [callback]);

  // Set up polling interval
  useEffect(() => {
    // Initial fetch
    fetchTradeActivity();
    
    // Set up interval to fetch every minute
    const intervalId = setInterval(fetchTradeActivity, 60000);
    
    setIsListening(true);
    console.log('Trade activity API listener set up with 60-second interval');
    
    return () => {
      clearInterval(intervalId);
      setIsListening(false);
      console.log('Trade activity API listener cleaned up');
    };
  }, [fetchTradeActivity]);
  
  return { isLoading, error, isListening, fetchTradeActivity };
}; 