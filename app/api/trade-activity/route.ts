import { NextResponse } from 'next/server';
import { formatEther, Address } from 'viem';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { getName } from '@coinbase/onchainkit/identity';
import { getFarcasterUser } from '@/utils/farcaster';

// UniswapV3 Pool contract address for $QR token on Base
const QR_UNISWAP_POOL_ADDRESS = '0xf02c421e15abdf2008bb6577336b0f3d7aec98f0' as const;

// QR token address (need this to track transfers)
const QR_TOKEN_ADDRESS = '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF' as const;

// Reduce MAX_BUY_EVENTS to decrease load
const MAX_BUY_EVENTS = 15; // Reduced from 25

// Alchemy RPC URL for Base
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// Fallback to public RPC if Alchemy key is missing
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// OPTIMIZATION: Reduce historical block range by 50% (24 hours to 12 hours)
const INITIAL_HISTORICAL_BLOCKS = BigInt(21600); // Reduced from 43200

// Known router/aggregator addresses that might appear as recipients
const KNOWN_ROUTERS = new Set([
  '0x6ff5693b99212da76ad316178a184ab56d299b43', // Uniswap V4 Universal Router
  '0x6b2c0c7be2048daa9b5527982c29f48062b34d58', // OKX: DEX Router 7
  '0x6a000f20005980200259b80c5102003040001068', // ParaSwap: Augustus V6.2
  '0x111111125421ca6dc452d289314280a0f8842a65', // 1inch Aggregation Router V6
  '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch Aggregation Router V5
  '0x5C9bdC801a600c006c388FC032dCb27355154cC9' // 0x Settler V1.10
]);

// ABI for the Swap event
const swapEventAbi = parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)');

// Transfer event signature topic (keccak256 of Transfer(address,address,uint256))
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// OPTIMIZATION: Increase cache duration for identity information
const identityCache = new Map<string, {displayName: string, timestamp: number, isResolved: boolean}>();
const CACHE_EXPIRY = 30 * 60 * 1000; // Increased from 5 minutes to 30 minutes

// Format address for display as fallback
const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Cache for processed logs to avoid duplicates
const processedLogsCache = new Map<string, number>(); // Map of logId to timestamp
const MAX_CACHE_SIZE = 1000;

// OPTIMIZATION: Increase cache expiry for processed logs from 5 minutes to 15 minutes
const PROCESSED_LOGS_CACHE_EXPIRY = 15 * 60 * 1000;

// Cache for trade activity results
let tradeActivityCache: TradeActivityResponse | null = null;
let lastCacheTime = 0;

// OPTIMIZATION: Significantly increase cache duration for API responses
const TRADE_ACTIVITY_CACHE_DURATION = 120 * 1000; // Increased from 15 seconds to 2 minutes

// OPTIMIZATION: Add rate limiting support
const apiRequestCounter = new Map<string, {count: number, timestamp: number}>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

// Clean old entries from processed logs cache
function cleanProcessedLogsCache() {
  const now = Date.now();
  // Remove entries older than the expiry time
  for (const [logId, timestamp] of processedLogsCache.entries()) {
    if (now - timestamp > PROCESSED_LOGS_CACHE_EXPIRY) {
      processedLogsCache.delete(logId);
    }
  }
  
  // If still too many entries, remove oldest ones
  if (processedLogsCache.size > MAX_CACHE_SIZE) {
    // Sort by timestamp (oldest first)
    const entries = Array.from(processedLogsCache.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.floor(MAX_CACHE_SIZE / 2)); // Remove oldest half
      
    // Delete those entries
    entries.forEach(([logId]) => processedLogsCache.delete(logId));
    console.log(`Cleared old entries from processedLogsCache, new size: ${processedLogsCache.size}`);
  }
}

/**
 * Resolves an Ethereum address to a human-readable identity
 * Prioritizes: Farcaster username > Basename/ENS > Formatted address
 * Includes caching to avoid repeated API calls
 */
async function getBidderIdentity(address: string): Promise<string> {
  // Defensive check for invalid addresses
  if (!address || typeof address !== 'string') {
    console.error("Invalid address provided to getBidderIdentity", address);
    return "Unknown";
  }

  // Check cache first with extended expiry
  const now = Date.now();
  const cached = identityCache.get(address);
  if (cached && cached.isResolved && now - cached.timestamp < CACHE_EXPIRY) {
    return cached.displayName;
  }

  // Format address for fallback display
  const formattedAddress = formatAddress(address);
  
  // If there's an unresolved cache entry, return the formatted address temporarily
  if (!cached) {
    // Add to cache as unresolved initially to prevent multiple resolution attempts
    identityCache.set(address, { 
      displayName: formattedAddress, 
      timestamp: now,
      isResolved: false 
    });
  }
  
  try {
    // Start with formatted address as default
    let displayName = formattedAddress;
    
    // OPTIMIZATION: Use Promise.allSettled to parallelize name resolution
    const [nameResult, farcasterResult] = await Promise.allSettled([
      // Try to get ENS/basename
      getName({
        address: address as Address,
        chain: base,
      }),
      
      // Try to get Farcaster identity
      getFarcasterUser(address)
    ]);
    
    // Process name result
    if (nameResult.status === 'fulfilled' && nameResult.value) {
      displayName = nameResult.value;
    }
    
    // Prioritize Farcaster over other identities
    if (farcasterResult.status === 'fulfilled' && farcasterResult.value?.username) {
      displayName = `@${farcasterResult.value.username}`;
    }
    
    // Cache the result with longer expiry
    identityCache.set(address, { 
      displayName, 
      timestamp: now,
      isResolved: true
    });
    
    return displayName;
  } catch (error) {
    console.error("Error in getBidderIdentity:", error);
    
    // Mark as resolved to prevent further attempts
    identityCache.set(address, { 
      displayName: formattedAddress, 
      timestamp: now,
      isResolved: true
    });
    
    return formattedAddress;
  }
}

interface SwapEvent {
  sender: string;
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
}

interface SwapLog {
  args: SwapEvent;
  blockHash: string;
  logIndex: number;
  transactionHash: string;
}

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
}

// Process a swap event and extract trade activity data
async function processSwapEvent(log: SwapLog, forceProcess = false): Promise<TradeActivity | null> {
  try {
    // Create a unique ID for the event to avoid duplicates
    const logId = `${log.blockHash}-${log.logIndex}`;
    const now = Date.now();
    
    // Skip if we've already processed this event recently, unless force processing
    if (!forceProcess && processedLogsCache.has(logId)) {
      const timestamp = processedLogsCache.get(logId);
      // Increased cache expiry period
      if (timestamp && now - timestamp < PROCESSED_LOGS_CACHE_EXPIRY) {
        return null;
      }
    }
    
    // Mark this event as processed with current timestamp
    processedLogsCache.set(logId, now);
    
    // Clean cache periodically - OPTIMIZATION: Less frequent cleaning
    if (processedLogsCache.size % 100 === 0) { // Increased from 50 to 100
      cleanProcessedLogsCache();
    }
    
    const { recipient, sender, amount0 } = log.args;
    
    // Determine if this is a buy or sell (amount0 < 0 means QR token is going out from pool = buy)
    const isBuy = amount0 < 0n;
    
    // Skip sell transactions
    if (!isBuy) {
      return null;
    }
    
    // Get token amount raw value
    const absAmount = amount0 < 0n ? -amount0 : amount0;
    const amountRaw = Number(formatEther(absAmount));
    
    // OPTIMIZATION: Increased dust threshold to filter out more tiny transactions
    if (amountRaw < 0.00005) { // Increased from 0.000001
      return null;
    }
    
    // Get transaction hash for block explorer link
    const txHash = log.transactionHash;
    
    // Check if the recipient is a known router/aggregator
    const recipientLower = recipient.toLowerCase();
    const senderLower = sender.toLowerCase();
    const isRouter = KNOWN_ROUTERS.has(recipientLower) || KNOWN_ROUTERS.has(senderLower);
    
    // For finding the actual recipient when the swap is through a router
    let actualRecipient = recipient;
    
    // OPTIMIZATION: Only trace routing if absolutley necessary
    if (isRouter) {
      try {
        // Use the global publicClient instead of creating a new one
        const receipt = await publicClient.getTransactionReceipt({
          hash: log.transactionHash as `0x${string}`
        });
        
        // Find Transfer events from $QR token in the same transaction
        if (receipt.logs && receipt.logs.length > 0) {
          // OPTIMIZATION: Filter logs more efficiently
          const tokenTransfers = receipt.logs
            .filter(transferLog => 
              // Match ERC20 Transfer events for our token
              transferLog.address.toLowerCase() === QR_TOKEN_ADDRESS.toLowerCase() &&
              transferLog.topics && 
              transferLog.topics[0] === TRANSFER_EVENT_TOPIC // Transfer event topic0
            );
          
          // OPTIMIZATION: Process only the most recent transfers (last 3)
          const relevantTransfers = tokenTransfers.length <= 3 ? 
            tokenTransfers.sort((a, b) => a.logIndex - b.logIndex) : 
            tokenTransfers.slice(-3).sort((a, b) => a.logIndex - b.logIndex);
          
          // Take the last transfer that's not to the router or zero address
          for (let i = relevantTransfers.length - 1; i >= 0; i--) {
            const transfer = relevantTransfers[i];
            if (transfer.topics && transfer.topics.length >= 3) {
              // Topics[2] is the 'to' address in Transfer(address,address,uint256)
              const toTopic = transfer.topics[2];
              if (!toTopic) continue;
              
              const to = `0x${toTopic.slice(-40)}`.toLowerCase();
              
              // Skip zero address
              if (to === '0x0000000000000000000000000000000000000000') continue;
              
              // Skip if recipient is another router
              if (KNOWN_ROUTERS.has(to)) continue;
              
              actualRecipient = `0x${toTopic.slice(-40)}`;
              break;
            }
          }
        }
      } catch (error) {
        console.error('Error tracing actual recipient:', error);
      }
    }
    
    // Get identity for buyer
    const trader = await getBidderIdentity(actualRecipient);

    // Create a unique message key
    const messageKey = `tx-${log.transactionHash}-${logId}`;
    
    // Return the trade activity data
    return {
      id: messageKey,
      message: `${trader} bought $QR`,
      txHash,
      trader,
      amountRaw,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error processing swap event:', error);
    return null;
  }
}

// Fetch trade activity data from the blockchain
async function fetchTradeActivity(): Promise<TradeActivity[]> {
  try {
    // Check if we have valid cached data with longer cache duration
    const now = Date.now();
    if (tradeActivityCache && (now - lastCacheTime < TRADE_ACTIVITY_CACHE_DURATION)) {
      console.log(`Returning cached trade activity (${tradeActivityCache.activities.length} items)`);
      return tradeActivityCache.activities;
    }

    // Reset cache if it's older than 30 minutes (increased from 10 minutes)
    const isStaleCache = (now - lastCacheTime > 30 * 60 * 1000);
    if (isStaleCache) {
      console.log("Cache is stale (>30 minutes), resetting processed logs cache");
      processedLogsCache.clear();
    }

    console.log("Cache expired or missing, fetching fresh trade activity data");

    // Get current block
    const currentBlock = await publicClient.getBlockNumber();
    
    // Use reduced historical block range
    const fromBlock = currentBlock > INITIAL_HISTORICAL_BLOCKS ? currentBlock - INITIAL_HISTORICAL_BLOCKS : 0n;
    
    // OPTIMIZATION: Use a more reasonable block range for large requests
    const MAX_BLOCK_RANGE = BigInt(5000); // Reduced from 10000
    const buyEvents: TradeActivity[] = [];
    
    // OPTIMIZATION: Process fewer chunks to reduce RPC calls
    // Only try up to 4 chunks (20,000 blocks) before giving up
    let chunkCount = 0;
    const MAX_CHUNKS = 4;
    
    // Process in chunks from newest to oldest
    for (let toBlock = currentBlock; 
         toBlock >= fromBlock && 
         buyEvents.length < MAX_BUY_EVENTS && 
         chunkCount < MAX_CHUNKS; 
         toBlock = toBlock - MAX_BLOCK_RANGE, chunkCount++) {
         
      const chunkFromBlock = toBlock - MAX_BLOCK_RANGE + 1n > fromBlock 
        ? fromBlock 
        : toBlock - MAX_BLOCK_RANGE + 1n;
      
      try {
        console.log(`Fetching logs from block ${chunkFromBlock} to ${toBlock}`);
        const events = await publicClient.getLogs({
          address: QR_UNISWAP_POOL_ADDRESS,
          event: swapEventAbi,
          fromBlock: chunkFromBlock,
          toBlock
        });
        
        console.log(`Found ${events.length} swap events in chunk`);
        
        // OPTIMIZATION: Process fewer events (don't go through all events)
        // Use a smarter approach:
        // - Process the newest 10 events
        // - Skip some events in the middle
        // - Only force process a few if needed
        const eventsToProcess = events.length <= 10 
          ? events 
          : events.slice(Math.max(0, events.length - 10)); // Only last 10
        
        // If we have few events after initial processing, force process some of the newest events
        const shouldForceProcess = (
          tradeActivityCache && 
          tradeActivityCache.activities.length === 0 && 
          eventsToProcess.length > 0
        );
        
        if (shouldForceProcess) {
          console.log("No events in previous cache, force processing newest events");
        }
        
        // Process selected events in reverse chronological order (newest first)
        for (let i = eventsToProcess.length - 1; i >= 0 && buyEvents.length < MAX_BUY_EVENTS; i--) {
          // Only force process a limited number of events
          const forceProcess = shouldForceProcess && (i >= eventsToProcess.length - 5);
          
          // Reduce random reprocessing frequency
          const randomReprocess = buyEvents.length < 5 && Math.random() < 0.1; // Reduced from 0.2
          
          const tradeActivity = await processSwapEvent(eventsToProcess[i] as SwapLog, forceProcess || randomReprocess);
          if (tradeActivity) {
            buyEvents.push(tradeActivity);
          }
        }
        
        // If we have enough buy events, stop fetching more chunks
        if (buyEvents.length >= MAX_BUY_EVENTS) {
          console.log(`Reached maximum buyEvents (${MAX_BUY_EVENTS}), stopping fetch`);
          break;
        }
      } catch (chunkError) {
        console.error(`Error fetching chunk from ${chunkFromBlock} to ${toBlock}:`, chunkError);
        // Continue with next chunk
      }
    }
    
    console.log(`Processed ${buyEvents.length} buy events total`);
    
    // If we didn't find any events but had some before, maintain at least a few 
    // from the previous cache to avoid empty ticker
    if (buyEvents.length === 0 && tradeActivityCache && tradeActivityCache.activities.length > 0) {
      console.log("No new events found, maintaining some from previous cache");
      // Keep the most recent events from previous cache (up to 5)
      const eventsToKeep = Math.min(5, tradeActivityCache.activities.length);
      buyEvents.push(...tradeActivityCache.activities.slice(0, eventsToKeep));
    }
    
    // Always update cache with our results
    tradeActivityCache = {
      activities: buyEvents,
      timestamp: now
    };
    lastCacheTime = now;
    
    return buyEvents;
  } catch (error) {
    console.error('Error fetching trade activity:', error);
    // Return cached data if available, otherwise empty array
    if (tradeActivityCache?.activities && tradeActivityCache.activities.length > 0) {
      console.log('Returning cached activity after error');
      return tradeActivityCache.activities;
    }
    
    // Return empty array if no activity is available
    console.log('No activity available, returning empty array');
    return [];
  }
}

// OPTIMIZATION: Use a simplified price fetching method with longer cache
let cachedPrice: number | null = null;
let priceCacheTime = 0;
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function fetchTokenPrice(): Promise<number | null> {
  try {
    const now = Date.now();
    if (cachedPrice !== null && (now - priceCacheTime < PRICE_CACHE_DURATION)) {
      return cachedPrice;
    }
    
    const apiUrl = `https://api.dexscreener.com/latest/dex/tokens/${QR_TOKEN_ADDRESS}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      const price = parseFloat(pair.priceUsd);
      
      if (!isNaN(price) && price > 0) {
        cachedPrice = price;
        priceCacheTime = now;
        return price;
      }
    }
    return cachedPrice; // Return existing cache on error
  } catch (error) {
    console.error('Error fetching token price:', error);
    return cachedPrice; // Return existing cache on error
  }
}

// Check rate limit for a client
function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const clientData = apiRequestCounter.get(clientIp);
  
  if (!clientData) {
    // First request from this client
    apiRequestCounter.set(clientIp, { count: 1, timestamp: now });
    return false;
  }
  
  if (now - clientData.timestamp > RATE_LIMIT_WINDOW) {
    // Reset counter if outside window
    apiRequestCounter.set(clientIp, { count: 1, timestamp: now });
    return false;
  }
  
  // Increment counter
  clientData.count++;
  apiRequestCounter.set(clientIp, clientData);
  
  // Check if exceeded limit
  return clientData.count > RATE_LIMIT_MAX_REQUESTS;
}

// Clear old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of apiRequestCounter.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW * 2) {
      apiRequestCounter.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// OPTIMIZATION: Add HTTP cache headers and rate limiting
export async function GET(request: Request) {
  try {
    console.log('Trade activity API called');
    
    // Get client IP from headers (assuming you have a proxy that sets this)
    const headers = new Headers(request.headers);
    const clientIp = headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    // Check rate limiting
    if (isRateLimited(clientIp)) {
      console.warn(`Rate limited request from ${clientIp}`);
      return NextResponse.json(
        { error: 'Too many requests', retry_after: RATE_LIMIT_WINDOW / 1000 },
        { 
          status: 429,
          headers: {
            'Retry-After': (RATE_LIMIT_WINDOW / 1000).toString(),
            'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + RATE_LIMIT_WINDOW / 1000).toString()
          }
        }
      );
    }
    
    // Check if we can return a cached response with proper HTTP cache headers
    if (tradeActivityCache && (Date.now() - lastCacheTime < TRADE_ACTIVITY_CACHE_DURATION)) {
      // Return cached response with proper cache headers
      return NextResponse.json(
        {
          activities: tradeActivityCache.activities,
          timestamp: tradeActivityCache.timestamp,
          price: cachedPrice
        },
        { 
          headers: {
            'Cache-Control': `public, max-age=${Math.floor(TRADE_ACTIVITY_CACHE_DURATION / 1000)}`,
            'ETag': `"${tradeActivityCache.timestamp}"`
          }
        }
      );
    }
    
    // Fetch trade activity in parallel with token price
    const [activities, tokenPrice] = await Promise.all([
      fetchTradeActivity(),
      fetchTokenPrice()
    ]);
    
    console.log(`Formatting ${activities.length} activities with price $${tokenPrice || 'unknown'}`);
    
    // Filter and format messages with USD values if price is available
    const formattedActivities = activities
      .filter(activity => {
        // Skip activities with USD value less than $0.10 (increased from $0.01)
        if (tokenPrice !== null) {
          const usdValue = activity.amountRaw * tokenPrice;
          return usdValue >= 0.10;
        }
        // Keep all activities if we don't have a price
        return true;
      })
      .map(activity => {
        let message = activity.message;
        
        if (tokenPrice !== null) {
          const usdValue = activity.amountRaw * tokenPrice;
          const formattedValue = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 2,
            minimumFractionDigits: 0
          }).format(usdValue);
          
          message = `${activity.trader} bought $QR (${formattedValue})`;
        } else {
          message = `${activity.trader} bought $QR (${activity.amountRaw.toFixed(2)} $QR)`;
        }
        
        return {
          ...activity,
          message
        };
      });
    
    const response = {
      activities: formattedActivities,
      timestamp: Date.now(),
      price: tokenPrice
    };
    
    // Update the cache
    tradeActivityCache = response;
    lastCacheTime = response.timestamp;
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${Math.floor(TRADE_ACTIVITY_CACHE_DURATION / 1000)}`,
        'ETag': `"${response.timestamp}"`
      }
    });
  } catch (error) {
    console.error('Error in trade activity API route:', error);
    
    // Return empty activities array on error
    return NextResponse.json({
      activities: [],
      timestamp: Date.now(),
      price: null,
      error: 'Error fetching data'
    }, { 
      status: 200, // Return 200 even on error so the UI doesn't show loading
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
} 