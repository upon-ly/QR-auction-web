import { useQuery } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Custom hook to fetch and cache winner data from Supabase
 * Uses TanStack Query for caching and stale-time management
 */
export function useWinnerData(tokenId: bigint | number) {
  // Convert tokenId to string to ensure consistent cache keys
  const tokenIdStr = tokenId.toString();
  
  return useQuery({
    queryKey: ['winner', tokenIdStr],
    queryFn: async () => {
      console.log(`[useWinnerData] Fetching winner data for auction #${tokenIdStr}`);
      
      const { data, error } = await supabase
        .from('winners')
        .select('usd_value, is_v1_auction')
        .eq('token_id', tokenIdStr)
        .single();
      
      if (error) {
        console.error('Error fetching winner data:', error);
        throw error;
      }
      
      console.log(`[useWinnerData] Successfully loaded winner data for auction #${tokenIdStr}`, data);
      return data;
    },
    // Cache the data for 5 minutes - adjust as needed
    staleTime: 5 * 60 * 1000,
    // Keep the data in cache for 30 minutes even when not being used
    gcTime: 30 * 60 * 1000,
    // Retry failed requests 3 times with exponential backoff
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
} 