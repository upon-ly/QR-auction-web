import { useState, useEffect, useCallback } from 'react';

// Constants for QR token
const QR_TOKEN_ADDRESS = '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF';

// Token price and market cap cache with expiration time
interface PriceCache {
  price: number;
  marketCap: number | null;
  timestamp: number;
}

// Global cache to persist between component re-renders
let tokenPriceCache: PriceCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Global callback registry for price updates
type PriceUpdateCallback = (price: number) => void;
const priceUpdateCallbacks: Set<PriceUpdateCallback> = new Set();

export const useTokenPrice = () => {
  const [priceUsd, setPriceUsd] = useState<number | null>(tokenPriceCache?.price || null);
  const [marketCap, setMarketCap] = useState<number | null>(tokenPriceCache?.marketCap || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokenPrice = useCallback(async (force = false) => {
    // Check if we have a valid cached price
    const now = Date.now();
    if (!force && tokenPriceCache && (now - tokenPriceCache.timestamp < CACHE_DURATION)) {
      console.log('Using cached token price:', tokenPriceCache.price);
      setPriceUsd(tokenPriceCache.price);
      setMarketCap(tokenPriceCache.marketCap);
      return { price: tokenPriceCache.price, marketCap: tokenPriceCache.marketCap };
    }

    // Fetch fresh price data
    setIsLoading(true);
    setError(null);

    try {
      // Using the correct API endpoint with the proper QR token address
      const apiUrl = `https://api.dexscreener.com/latest/dex/tokens/${QR_TOKEN_ADDRESS}`;
      console.log('Fetching QR token price from:', apiUrl);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('DexScreener API response data received');
      
      if (data && data.pairs && data.pairs.length > 0) {
        // Get the price and market cap from the first pair (likely the most liquid)
        const pair = data.pairs[0];
        const price = parseFloat(pair.priceUsd);
        let marketCapValue = null;
        
        // Extract market cap if available or calculate it from fdv (fully diluted value)
        if (pair.fdv) {
          marketCapValue = parseFloat(pair.fdv);
        } else if (pair.liquidity?.usd) {
          // Estimate market cap as 2x liquidity as a fallback
          marketCapValue = parseFloat(pair.liquidity.usd) * 2;
        }
        
        if (!isNaN(price) && price > 0) {
          console.log('Setting QR token price:', price, 'Market Cap:', marketCapValue);
          setPriceUsd(price);
          setMarketCap(marketCapValue);
          
          // Update cache
          tokenPriceCache = {
            price,
            marketCap: marketCapValue,
            timestamp: now
          };
          
          // Notify all registered callbacks about the price update
          priceUpdateCallbacks.forEach(callback => {
            try {
              callback(price);
            } catch (callbackError) {
              console.error("Error in price update callback:", callbackError);
            }
          });
          
          return { price, marketCap: marketCapValue };
        } else {
          throw new Error('Invalid price data received');
        }
      } else {
        throw new Error('No price data available');
      }
    } catch (err) {
      console.error('Error fetching token price:', err);
      setError(err instanceof Error ? err.message : String(err));
      return { price: null, marketCap: null };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Register a callback for price updates
  const onPriceUpdate = useCallback((callback: PriceUpdateCallback) => {
    priceUpdateCallbacks.add(callback);
    
    // If we already have a price, immediately call the callback
    if (priceUsd !== null) {
      try {
        callback(priceUsd);
      } catch (error) {
        console.error("Error in immediate price update callback:", error);
      }
    }
    
    // Return cleanup function to unregister
    return () => {
      priceUpdateCallbacks.delete(callback);
    };
  }, [priceUsd]);

  // Fetch price on initial load
  useEffect(() => {
    // Immediate fetch on mount
    fetchTokenPrice(true); // Force fetch on initial mount
    
    console.log('Initialized token price hook', {
      cachedPrice: tokenPriceCache?.price || 'none',
      currentPriceUsd: priceUsd
    });
    
    // Set up periodic refresh (every 2 minutes)
    const refreshInterval = setInterval(() => {
      fetchTokenPrice();
    }, 2 * 60 * 1000);
    
    return () => clearInterval(refreshInterval);
  }, [fetchTokenPrice]);

  // Ensure we have a price as soon as possible
  useEffect(() => {
    if (priceUsd === null) {
      // If we don't have a price yet, retry after a short delay
      const retryTimer = setTimeout(() => {
        console.log('Retrying token price fetch after delay');
        fetchTokenPrice(true);
      }, 2000); // Retry after 2 seconds
      
      return () => clearTimeout(retryTimer);
    }
  }, [priceUsd, fetchTokenPrice]);

  // Format a token amount to USD
  const formatAmountToUsd = useCallback((amount: number): string => {
    if (priceUsd === null) return '';
    
    const usdValue = amount * priceUsd;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(usdValue);
  }, [priceUsd]);

  // Format market cap for display
  const formatMarketCap = useCallback((): string => {
    if (marketCap === null) return 'MKT CAP = N/A';
    
    // Format with appropriate suffix (K, M, B)
    let formattedValue: string;
    if (marketCap >= 1e9) {
      formattedValue = `$${(marketCap / 1e9).toFixed(1)}B`;
    } else if (marketCap >= 1e6) {
      formattedValue = `$${(marketCap / 1e6).toFixed(1)}M`;
    } else {
      formattedValue = `$${(marketCap / 1e3).toFixed(0)}K`;
    }
    
    return `MKT CAP = ${formattedValue}`;
  }, [marketCap]);

  return { 
    priceUsd, 
    marketCap, 
    isLoading, 
    error, 
    fetchTokenPrice, 
    formatAmountToUsd,
    formatMarketCap,
    onPriceUpdate
  };
}; 