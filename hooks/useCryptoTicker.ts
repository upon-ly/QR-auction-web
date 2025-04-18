import { useState, useEffect } from 'react';

interface TokenPrice {
  symbol: string;
  price: number;
  priceChange24h: number;
  color: string;
}

// Token colors remain as constants since they're visual elements
const TOKEN_COLORS = {
  BTC: '#f7931a', // Bitcoin orange
  ETH: '#8c8c8c', // Ethereum gray
  XRP: '#016ca7', // XRP blue
  SOL: '#9945FF', // Solana purple
  DOGE: '#face00', // Dogecoin yellow
  // Base tokens
  CLANKER: '#8a63d0', // Clanker
  DEGEN: '#8b5cf6', // Degen
  HIGHER: '#018a08', // Higher
  QR: '#ffffff', // QR
};

// CoinGecko IDs for major tokens
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XRP: 'ripple',
  SOL: 'solana',
  DOGE: 'dogecoin',
};

// Base token addresses for DexScreener API
const BASE_TOKEN_ADDRESSES = {
  CLANKER: '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb',
  HIGHER: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe',
  DEGEN: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
  QR: '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF'
};

// Tokens to display, in order
const TOKENS_TO_DISPLAY = [
  'BTC', 'ETH', 'XRP', 'SOL', 'DOGE',  // Major tokens
  'HIGHER', 'QR', 'CLANKER',  'DEGEN',  // Base tokens
];

export const useCryptoTicker = () => {
  const [tokens, setTokens] = useState<TokenPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch Base tokens directly from DexScreener API
  const fetchBaseTokens = async () => {
    try {
      // Get comma-separated token addresses
      const tokenAddresses = Object.values(BASE_TOKEN_ADDRESSES).join(',');
      
      // Use the correct DexScreener API endpoint
      const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses}`;
      console.log(`Fetching Base tokens from: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch Base tokens: ${response.status}`);
        return {};
      }
      
      const data = await response.json();
      console.log('DexScreener response:', data);
      
      const results: Record<string, TokenPrice> = {};
      
      // DexScreener response has a pairs array
      if (data && data.pairs && Array.isArray(data.pairs)) {
        // Group pairs by token address to find the most liquid pair for each token
        const pairsByToken: Record<string, Array<{
          baseToken?: { address?: string };
          quoteToken?: { address?: string };
          priceUsd: string;
          priceChange?: { h24?: string };
          liquidity?: { usd?: number };
        }>> = {};
        
        // Process all pairs to find Base tokens
        data.pairs.forEach((pair: {
          baseToken?: { address?: string };
          quoteToken?: { address?: string };
          priceUsd: string;
          priceChange?: { h24?: string };
          liquidity?: { usd?: number };
        }) => {
          if (!pair || !pair.baseToken || !pair.quoteToken) return;
          
          // Check both base and quote tokens
          [pair.baseToken, pair.quoteToken].forEach((token) => {
            if (!token || !token.address) return;
            
            const tokenAddress = token.address.toLowerCase();
            // Find which Base token this is
            const baseToken = Object.entries(BASE_TOKEN_ADDRESSES).find(
              ([, address]) => address.toLowerCase() === tokenAddress
            );
            
            if (baseToken) {
              const symbol = baseToken[0];
              if (!pairsByToken[symbol]) {
                pairsByToken[symbol] = [];
              }
              pairsByToken[symbol].push(pair);
            }
          });
        });
        
        // For each Base token, use the most liquid pair
        Object.entries(pairsByToken).forEach(([symbol, pairs]) => {
          if (pairs.length === 0) return;
          
          // Sort by USD liquidity to find the most liquid pair
          pairs.sort((a, b) => {
            const liquidityA = a.liquidity?.usd || 0;
            const liquidityB = b.liquidity?.usd || 0;
            return liquidityB - liquidityA;
          });
          
          const pair = pairs[0];
          const price = parseFloat(pair.priceUsd);
          const priceChange24h = pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : 0;
          
          if (!isNaN(price) && price > 0) {
            results[symbol] = {
              symbol,
              price,
              priceChange24h: isNaN(priceChange24h) ? 0 : priceChange24h,
              color: TOKEN_COLORS[symbol as keyof typeof TOKEN_COLORS] || '#ffffff'
            };
            console.log(`Found ${symbol} price: $${price} (${priceChange24h}%)`);
          }
        });
      }
      
      return results;
    } catch (err) {
      console.error('Error fetching Base token prices:', err);
      return {};
    }
  };
  
  // Fetch prices from CoinGecko for major tokens
  const fetchCoinGeckoPrices = async () => {
    try {
      // Build a list of IDs to fetch from CoinGecko
      const ids = Object.values(COINGECKO_IDS).join(',');
      
      // Fetch from CoinGecko API
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch token prices from CoinGecko');
      }
      
      const data = await response.json();
      const results: Record<string, TokenPrice> = {};
      
      // Process each token from CoinGecko response
      Object.entries(COINGECKO_IDS).forEach(([symbol, id]) => {
        if (data[id]) {
          results[symbol] = {
            symbol,
            price: data[id].usd || 0,
            priceChange24h: data[id].usd_24h_change || 0,
            color: TOKEN_COLORS[symbol as keyof typeof TOKEN_COLORS] || '#ffffff'
          };
        }
      });
      
      return results;
    } catch (err) {
      console.error('Error fetching CoinGecko prices:', err);
      return {};
    }
  };
  
  const fetchPrices = async () => {
    try {
      setLoading(true);
      
      // Fetch prices in parallel
      const [baseTokenPrices, coingeckoPrices] = await Promise.all([
        fetchBaseTokens(),
        fetchCoinGeckoPrices()
      ]);
      
      // Combine prices from both sources
      const combinedPrices = { ...coingeckoPrices, ...baseTokenPrices };
      
      // Convert to array in specified order
      const tokenPrices = TOKENS_TO_DISPLAY
        .filter(symbol => combinedPrices[symbol] && combinedPrices[symbol].price > 0)
        .map(symbol => combinedPrices[symbol]);
      
      setTokens(tokenPrices);
      setError(null);
    } catch (err) {
      console.error('Error fetching token prices:', err);
      setError('Failed to fetch token prices');
      
      // Only use existing data, don't add placeholders
      setTokens(prev => prev);
    } finally {
      setLoading(false);
    }
  };

  // Fetch prices on component mount and every 30 seconds
  useEffect(() => {
    fetchPrices();
    
    const interval = setInterval(() => {
      fetchPrices();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  return { tokens, loading, error };
}; 