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
const MAX_BUY_EVENTS = 10;

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

// Historical blocks to fetch - ~24 hours (about 43200 blocks at 2s block time)
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
const processedLogsCache = new Set<string>();
// Cache for trade activity results
let tradeActivityCache: TradeActivityResponse | null = null;
let lastCacheTime = 0;
const TRADE_ACTIVITY_CACHE_DURATION = 30 * 1000; // 30 seconds

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
async function processSwapEvent(log: SwapLog): Promise<TradeActivity | null> {
  try {
    // Create a unique ID for the event to avoid duplicates
    const logId = `${log.blockHash}-${log.logIndex}`;
    
    // Skip if we've already processed this event
    if (processedLogsCache.has(logId)) {
      return null;
    }
    
    // Mark this event as processed
    processedLogsCache.add(logId);
    
    const { recipient, sender, amount0 } = log.args;
    
    // Determine if this is a buy or sell
    const isBuy = amount0 < 0n;
    
    // Only process buy transactions
    if (!isBuy) {
      return null;
    }
    
    // Get token amount raw value
    const absAmount = amount0 < 0n ? -amount0 : amount0;
    const amountRaw = Number(formatEther(absAmount));
    
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
      return tradeActivityCache.activities;
    }

    // Get current block
    const currentBlock = await publicClient.getBlockNumber();
    
    // Get historical events (24 hours)
    const fromBlock = currentBlock > INITIAL_HISTORICAL_BLOCKS ? currentBlock - INITIAL_HISTORICAL_BLOCKS : 0n;
    
    // Fetch in smaller chunks to avoid RPC timeouts on large ranges
    const MAX_BLOCK_RANGE = BigInt(10000);
    const buyEvents: TradeActivity[] = [];
    
    // Process in chunks from newest to oldest
    for (let toBlock = currentBlock; toBlock >= fromBlock && buyEvents.length < MAX_BUY_EVENTS; toBlock = toBlock - MAX_BLOCK_RANGE) {
      const chunkFromBlock = toBlock - MAX_BLOCK_RANGE + 1n > fromBlock ? fromBlock : toBlock - MAX_BLOCK_RANGE + 1n;
      
      try {
        const events = await publicClient.getLogs({
          address: QR_UNISWAP_POOL_ADDRESS,
          event: swapEventAbi,
          fromBlock: chunkFromBlock,
          toBlock
        });
        
        // Process events in reverse chronological order (newest first)
        for (let i = events.length - 1; i >= 0 && buyEvents.length < MAX_BUY_EVENTS; i--) {
          const tradeActivity = await processSwapEvent(events[i] as SwapLog);
          if (tradeActivity) {
            buyEvents.push(tradeActivity);
          }
        }
        
        // If we have enough buy events, stop fetching more chunks
        if (buyEvents.length >= MAX_BUY_EVENTS) {
          break;
        }
      } catch (chunkError) {
        console.error(`Error fetching chunk from ${chunkFromBlock} to ${toBlock}:`, chunkError);
        // Continue with next chunk
      }
    }
    
    // Update cache
    tradeActivityCache = {
      activities: buyEvents,
      timestamp: now
    };
    lastCacheTime = now;
    
    return buyEvents;
  } catch (error) {
    console.error('Error fetching trade activity:', error);
    // Return cached data if available, otherwise empty array
    return tradeActivityCache?.activities || [];
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
    // Fetch trade activity in parallel with token price
    const [activities, tokenPrice] = await Promise.all([
      fetchTradeActivity(),
      fetchTokenPrice()
    ]);
    
    // Format messages with USD values if price is available
    const formattedActivities = activities.map(activity => {
      let message = activity.message;
      
      if (tokenPrice !== null) {
        const usdValue = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
          minimumFractionDigits: 0
        }).format(activity.amountRaw * tokenPrice);
        
        message = `${activity.trader} bought $QR (${usdValue})`;
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
    return NextResponse.json(
      { error: 'Failed to fetch trade activity' },
      { status: 500 }
    );
  }
} 