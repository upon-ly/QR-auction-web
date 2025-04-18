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

// Maximum number of buy events to display
const MAX_BUY_EVENTS = 25;

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

// Historical blocks to fetch - ~48 hours (about 86400 blocks at 2s block time)
const INITIAL_HISTORICAL_BLOCKS = BigInt(43200);

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

// Cache identity information to avoid repeated API calls
const identityCache = new Map<string, {displayName: string, timestamp: number, isResolved: boolean}>();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Format address for display as fallback
const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Cache for processed logs to avoid duplicates
const processedLogsCache = new Map<string, number>(); // Map of logId to timestamp
// Add a max size and auto-clearing mechanism for the cache
const MAX_CACHE_SIZE = 1000;
// Cache expiry for processed logs (5 minutes)
const PROCESSED_LOGS_CACHE_EXPIRY = 5 * 60 * 1000;
// Cache for trade activity results
let tradeActivityCache: TradeActivityResponse | null = null;
let lastCacheTime = 0;
// Reduced cache duration to refresh more often
const TRADE_ACTIVITY_CACHE_DURATION = 15 * 1000; // 15 seconds

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

  // Check cache first
  const now = Date.now();
  const cached = identityCache.get(address);
  if (cached && cached.isResolved && now - cached.timestamp < CACHE_EXPIRY) {
    return cached.displayName;
  }

  // If there's an unresolved cache entry, return the formatted address temporarily
  const formattedAddress = formatAddress(address);
  if (!cached) {
    // Add to cache as unresolved initially to prevent multiple resolution attempts
    identityCache.set(address, { 
      displayName: formattedAddress, 
      timestamp: now,
      isResolved: false 
    });
  }
  
  try {
    // Default to formatted address in case resolution fails
    let displayName = formattedAddress;
    
    try {
      // Use Coinbase onchainkit's getName to get basename/ENS
      const name = await getName({
        address: address as Address,
        chain: base,
      });
      
      if (name) {
        displayName = name; // getName already handles basename/ENS priority
      }
    } catch (nameError) {
      console.error("Error fetching onchain name:", nameError);
      // Continue execution - we'll fall back to the formatted address
    }
    
    try {
      // Get Farcaster identity
      const farcasterUser = await getFarcasterUser(address);
      
      // Prioritize Farcaster over other identities
      if (farcasterUser?.username) {
        displayName = `@${farcasterUser.username}`;
      }
    } catch (farcasterError) {
      console.error("Error fetching Farcaster identity:", farcasterError);
      // Continue execution - we'll use what we have so far
    }
    
    // Cache the result
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
      // Shorter cache expiry for processed events (1 minute) to allow reprocessing more often
      if (timestamp && now - timestamp < 60 * 1000) {
        return null;
      }
    }
    
    // Mark this event as processed with current timestamp
    processedLogsCache.set(logId, now);
    
    // Clean cache periodically
    if (processedLogsCache.size % 50 === 0) {
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
    
    // Lower dust threshold to include more transactions, but still skip extremely tiny ones
    if (amountRaw < 0.000001) {
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
    
    if (isRouter) {
      try {
        // Use the global publicClient instead of creating a new one
        const receipt = await publicClient.getTransactionReceipt({
          hash: log.transactionHash as `0x${string}`
        });
        
        // Find Transfer events from $QR token in the same transaction
        if (receipt.logs && receipt.logs.length > 0) {
          // Sort logs by index to get the final transfers
          const tokenTransfers = receipt.logs
            .filter(transferLog => 
              // Match ERC20 Transfer events for our token
              transferLog.address.toLowerCase() === QR_TOKEN_ADDRESS.toLowerCase() &&
              transferLog.topics && 
              transferLog.topics[0] === TRANSFER_EVENT_TOPIC // Transfer event topic0
            )
            .sort((a, b) => a.logIndex - b.logIndex);
          
          // Take the last transfer that's not to the router or zero address
          for (let i = tokenTransfers.length - 1; i >= 0; i--) {
            const transfer = tokenTransfers[i];
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
    // Check if we have valid cached data
    const now = Date.now();
    if (tradeActivityCache && (now - lastCacheTime < TRADE_ACTIVITY_CACHE_DURATION)) {
      console.log(`Returning cached trade activity (${tradeActivityCache.activities.length} items)`);
      return tradeActivityCache.activities;
    }

    // Reset cache if it's older than 10 minutes to ensure we process events again
    const isStaleCache = (now - lastCacheTime > 10 * 60 * 1000);
    if (isStaleCache) {
      console.log("Cache is stale (>10 minutes), resetting processed logs cache");
      processedLogsCache.clear();
    }

    console.log("Cache expired or missing, fetching fresh trade activity data");

    // Get current block
    const currentBlock = await publicClient.getBlockNumber();
    
    // Get historical events (looking further back to find more events)
    const fromBlock = currentBlock > INITIAL_HISTORICAL_BLOCKS ? currentBlock - INITIAL_HISTORICAL_BLOCKS : 0n;
    
    // Fetch in smaller chunks to avoid RPC timeouts on large ranges
    const MAX_BLOCK_RANGE = BigInt(10000);
    const buyEvents: TradeActivity[] = [];
    
    // Process in chunks from newest to oldest
    for (let toBlock = currentBlock; toBlock >= fromBlock && buyEvents.length < MAX_BUY_EVENTS; toBlock = toBlock - MAX_BLOCK_RANGE) {
      const chunkFromBlock = toBlock - MAX_BLOCK_RANGE + 1n > fromBlock ? fromBlock : toBlock - MAX_BLOCK_RANGE + 1n;
      
      try {
        console.log(`Fetching logs from block ${chunkFromBlock} to ${toBlock}`);
        const events = await publicClient.getLogs({
          address: QR_UNISWAP_POOL_ADDRESS,
          event: swapEventAbi,
          fromBlock: chunkFromBlock,
          toBlock
        });
        
        console.log(`Found ${events.length} swap events in chunk`);
        
        // If we have few events after initial processing, force process some of the newest events
        const shouldForceProcess = (
          tradeActivityCache && 
          tradeActivityCache.activities.length === 0 && 
          events.length > 0
        );
        
        if (shouldForceProcess) {
          console.log("No events in previous cache, force processing newest events");
        }
        
        // Process all events in reverse chronological order (newest first)
        for (let i = events.length - 1; i >= 0 && buyEvents.length < MAX_BUY_EVENTS; i--) {
          // Force process some events if we need to
          const forceProcess = shouldForceProcess && (i >= events.length - 15);
          
          // Occasionally reprocess events to ensure we have a healthy number
          const randomReprocess = buyEvents.length < 5 && Math.random() < 0.2;
          
          const tradeActivity = await processSwapEvent(events[i] as SwapLog, forceProcess || randomReprocess);
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

// Fetch token price from DexScreener API
async function fetchTokenPrice(): Promise<number | null> {
  try {
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
        return price;
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching token price:', error);
    return null;
  }
}

// API route handler
export async function GET() {
  try {
    console.log('Trade activity API called');
    
    // Fetch trade activity in parallel with token price
    const [activities, tokenPrice] = await Promise.all([
      fetchTradeActivity(),
      fetchTokenPrice()
    ]);
    
    console.log(`Formatting ${activities.length} activities with price $${tokenPrice || 'unknown'}`);
    
    // Filter and format messages with USD values if price is available
    const formattedActivities = activities
      .filter(activity => {
        // Skip activities with USD value less than $0.01
        if (tokenPrice !== null) {
          const usdValue = activity.amountRaw * tokenPrice;
          return usdValue >= 0.01;
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
    
    return NextResponse.json({
      activities: formattedActivities,
      timestamp: Date.now(),
      price: tokenPrice
    });
  } catch (error) {
    console.error('Error in trade activity API route:', error);
    
    // Return empty activities array on error
    return NextResponse.json({
      activities: [],
      timestamp: Date.now(),
      price: null,
      error: 'Error fetching data'
    }, { status: 200 }); // Return 200 even on error so the UI doesn't show loading
  }
} 