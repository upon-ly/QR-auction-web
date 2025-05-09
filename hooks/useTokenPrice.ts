import { useState, useEffect, useCallback } from 'react';

// Constants for QR token
const QR_TOKEN_ADDRESS = '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF';

// Token price and market cap cache with expiration time
interface PriceCache {
  price: number;
  marketCap: number | null;
  timestamp: number;
}

// Debug mode - set to true for verbose logging
const DEBUG = false;

// LocalStorage key for persisting price data
const PRICE_STORAGE_KEY = 'qr_price_cache';

// Load cached price from localStorage on init
const loadCachedPrice = (): PriceCache | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(PRICE_STORAGE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached) as PriceCache;
    const now = Date.now();
    
    // Only use cache if it's not too old
    if (now - data.timestamp < 30 * 60 * 1000) { // 30 minutes max
      if (DEBUG) {
        console.log('Loaded price data from localStorage:', data);
      }
      return data;
    }
    return null;
  } catch (e) {
    console.error('Error loading price from localStorage:', e);
    return null;
  }
};

// Global cache to persist between component re-renders
let tokenPriceCache: PriceCache | null = loadCachedPrice();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Global callback registry for price updates
type PriceUpdateCallback = (price: number) => void;
const priceUpdateCallbacks: Set<PriceUpdateCallback> = new Set();

export const useTokenPrice = () => {
  const [priceUsd, setPriceUsd] = useState<number | null>(tokenPriceCache?.price || null);
  const [marketCap, setMarketCap] = useState<number | null>(tokenPriceCache?.marketCap || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save price to localStorage
  const savePriceToStorage = useCallback((cache: PriceCache) => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('Error saving price to localStorage:', e);
    }
  }, []);

  const fetchTokenPrice = useCallback(async (force = false) => {
    // Check if we have a valid cached price
    const now = Date.now();
    if (!force && tokenPriceCache && (now - tokenPriceCache.timestamp < CACHE_DURATION)) {
      if (DEBUG) {
        console.log('Using cached token price:', tokenPriceCache.price);
      }
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
      if (DEBUG) {
        console.log('Fetching QR token price from:', apiUrl);
      }
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      if (DEBUG) {
        console.log('DexScreener API response data received');
      }
      
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
          if (DEBUG) {
            console.log('Setting QR token price:', price, 'Market Cap:', marketCapValue);
          }
          setPriceUsd(price);
          setMarketCap(marketCapValue);
          
          // Update cache
          const newCache = {
            price,
            marketCap: marketCapValue,
            timestamp: now
          };
          
          tokenPriceCache = newCache;
          
          // Also save to localStorage for persistence between page loads
          savePriceToStorage(newCache);
          
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
      
      // If we have a cached price but it's expired, use it as fallback on error
      if (tokenPriceCache && !force) {
        if (DEBUG) {
          console.log('Using expired cache as fallback after API error');
        }
        setPriceUsd(tokenPriceCache.price);
        setMarketCap(tokenPriceCache.marketCap);
        return { price: tokenPriceCache.price, marketCap: tokenPriceCache.marketCap };
      }
      
      return { price: null, marketCap: null };
    } finally {
      setIsLoading(false);
    }
  }, [savePriceToStorage]);

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
    // Always try to load from cache first on mount
    if (tokenPriceCache?.price && !priceUsd) {
      setPriceUsd(tokenPriceCache.price);
      setMarketCap(tokenPriceCache.marketCap);
    }
    
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
  }, [fetchTokenPrice, priceUsd]);
  
  // Ensure we have a price as soon as possible
  useEffect(() => {
    if (priceUsd === null) {
      // If we don't have a price yet, retry multiple times at increasing intervals
      const retryTimes = [2000, 5000, 10000]; // Retry after 2s, 5s, and 10s
      
      const retryTimers = retryTimes.map((delay, index) => {
        return setTimeout(() => {
          if (DEBUG) {
            console.log(`Retry ${index + 1} for token price fetch after ${delay}ms`);
          }
          fetchTokenPrice(true);
        }, delay);
      });
      
      return () => {
        retryTimers.forEach(timer => clearTimeout(timer));
      };
    }
  }, [priceUsd, fetchTokenPrice]);

  // Format a token amount to USD
  const formatAmountToUsd = useCallback((amount: number): string => {
    // Always try to use the global cache if available, even if component state isn't updated yet
    const priceToUse = priceUsd || tokenPriceCache?.price;
    
    if (priceToUse === null || priceToUse === undefined) return '';
    
    const usdValue = amount * priceToUse;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(usdValue);
  }, [priceUsd]);

  // Format market cap for display
  const formatMarketCap = useCallback((): string => {
    // Try to use global cache if state isn't set
    const marketCapToUse = marketCap || tokenPriceCache?.marketCap;
    
    if (marketCapToUse === null || marketCapToUse === undefined) return 'MKT CAP = N/A';
    
    // Format with appropriate suffix (K, M, B)
    let formattedValue: string;
    if (marketCapToUse >= 1e9) {
      formattedValue = `$${(marketCapToUse / 1e9).toFixed(1)}B`;
    } else if (marketCapToUse >= 1e6) {
      formattedValue = `$${(marketCapToUse / 1e6).toFixed(1)}M`;
    } else {
      formattedValue = `$${(marketCapToUse / 1e3).toFixed(0)}K`;
    }
    
    return `MKT CAP = ${formattedValue}`;
  }, [marketCap]);

  // Get raw price even if not yet in state
  const getRawPrice = useCallback((): number | null => {
    return priceUsd || tokenPriceCache?.price || null;
  }, [priceUsd]);

  return { 
    priceUsd, 
    marketCap, 
    isLoading, 
    error, 
    fetchTokenPrice, 
    formatAmountToUsd,
    formatMarketCap,
    onPriceUpdate,
    getRawPrice
  };
}; 