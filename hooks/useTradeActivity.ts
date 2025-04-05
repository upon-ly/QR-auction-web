import { useState, useEffect, useCallback } from 'react';
import { formatEther, Address } from 'viem';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { useTokenPrice } from './useTokenPrice';
import { getName } from '@coinbase/onchainkit/identity';
import { getFarcasterUser } from '@/utils/farcaster';

// UniswapV3 Pool contract address for $QR token on Base
const QR_UNISWAP_POOL_ADDRESS = '0xf02c421e15abdf2008bb6577336b0f3d7aec98f0' as const;

// QR token address (need this to track transfers)
const QR_TOKEN_ADDRESS = '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF' as const;

// Maximum number of buy events to display
const MAX_BUY_EVENTS = 5;

// Alchemy RPC URL for Base
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = typeof window !== 'undefined' ? 
  process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '' : '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// Let users know we're using a fallback if Alchemy key is missing
if (!ALCHEMY_API_KEY && typeof window !== 'undefined') {
  console.warn('No Alchemy API key found in environment variables. Using public RPC endpoint.');
}

// Fallback to public RPC if Alchemy key is missing
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// Fetch interval in milliseconds - 30 seconds instead of 15 to reduce API calls
const FETCH_INTERVAL = 30000;

// Historical blocks to fetch on first load - ~24 hours (about 43200 blocks at 2s block time)
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

// Debug mode - set to true for verbose logging
const DEBUG = true;

// Helper for debug logging
const debugLog = (...args: unknown[]) => {
  if (DEBUG) {
    console.log('[useTradeActivity]', ...args);
  }
};

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

// Store a memory of pending updates that need price information
interface PendingTradeUpdate {
  txHash: string;
  messageKey: string;
  amountRaw: number;
  trader: string;
  nameResolved: boolean;
}

// Global list of pending updates waiting for price data
const pendingUpdates = new Map<string, PendingTradeUpdate>();

export const useTradeActivity = (callback: (message: string, txHash?: string, messageKey?: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<bigint>(0n);
  const { formatAmountToUsd, onPriceUpdate, priceUsd, getRawPrice } = useTokenPrice();

  // Handle price updates and update existing messages
  useEffect(() => {
    // When we get a price update, update all pending trade messages
    const updateHandler = (price: number) => {
      debugLog(`Price updated to ${price}, updating ${pendingUpdates.size} pending trade messages`);
      
      // Process all pending updates with the new price data
      pendingUpdates.forEach((update, key) => {
        const { txHash, messageKey, amountRaw, trader, nameResolved } = update;
        
        debugLog(`Updating message with key ${messageKey}:`, {
          trader,
          amountRaw,
          nameResolved,
          calculatedUsd: amountRaw * price
        });
        
        // Format amount with the new price consistently
        const usdValue = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
          minimumFractionDigits: 0
        }).format(amountRaw * price);
        
        // Create updated message with USD value, preserving the trader name
        const updatedMessage = `${trader} bought $QR (${usdValue})`;
        
        // Send the updated message
        callback(updatedMessage, txHash, messageKey);
        
        // Keep in pending list if name isn't resolved yet, otherwise remove
        if (!nameResolved) {
          debugLog(`Message ${messageKey} still waiting for name resolution`);
          pendingUpdates.set(key, {
            ...update
          });
        } else {
          // Both name and price are resolved, we can remove
          debugLog(`Message ${messageKey} fully resolved, removing from pending`);
          pendingUpdates.delete(key);
        }
      });
    };
    
    // Register for price updates
    const cleanup = onPriceUpdate(updateHandler);
    
    // Initial check for pending updates if we already have price
    const currentPrice = getRawPrice();
    if (currentPrice !== null && pendingUpdates.size > 0) {
      debugLog(`Initial price already available (${currentPrice}), applying to pending updates`);
      updateHandler(currentPrice);
    }
    
    return cleanup;
  }, [onPriceUpdate, callback, getRawPrice]);

  // Process a swap event and return true if it's a buy event
  const processSwapEvent = useCallback(async (log: SwapLog): Promise<boolean> => {
    try {
      // Create a unique ID for the event to avoid duplicates
      const logId = `${log.blockHash}-${log.logIndex}`;
      
      // Skip if we've already processed this event
      if (processedIds.has(logId)) {
        debugLog(`Event ${logId} already processed, skipping`);
        return false;
      }
      
      // Mark this event as processed
      setProcessedIds(prev => new Set([...prev, logId]));
      
      const { recipient, sender, amount0 } = log.args;
      console.log(log.args.recipient)
      
      // Determine if this is a buy or sell
      const isBuy = amount0 < 0n;
      
      // Only process buy transactions
      if (!isBuy) {
        debugLog(`Event ${logId} is not a buy event, skipping`);
        return false;
      }
      
      // Create a stable message key
      const messageKey = `tx-${log.transactionHash}-${logId}`;
      debugLog(`Processing buy event with key ${messageKey}`);
      
      // Get token amount raw value
      const absAmount = amount0 < 0n ? -amount0 : amount0;
      const amountRaw = Number(formatEther(absAmount));
      debugLog(`Amount raw: ${amountRaw}`);
      
      // Get raw price directly from global cache to prevent UI render issues
      const currentPrice = getRawPrice();
      
      // Get transaction hash for block explorer link
      const txHash = log.transactionHash;
      
      // Check if the recipient is a known router/aggregator
      const recipientLower = recipient.toLowerCase();
      const senderLower = sender.toLowerCase();
      console.log(recipientLower, senderLower)
      const isRouter = KNOWN_ROUTERS.has(recipientLower) || KNOWN_ROUTERS.has(senderLower);
      console.log(isRouter)
      
      // For finding the actual recipient when the swap is through a router
      let actualRecipient = recipient;
      
      if (isRouter) {
        console.log(`Recipient ${recipient} is a router/aggregator, will try to find actual recipient`);
        debugLog(`Recipient ${recipient} is a router/aggregator, will try to find actual recipient`);
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
            
            debugLog(`Found ${tokenTransfers.length} token transfers in transaction`);
            
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
                debugLog(`Found actual recipient address: ${actualRecipient}`);
                break;
              }
            }
          }
        } catch (error) {
          console.error('Error tracing actual recipient:', error);
          debugLog(`Falling back to swap recipient address due to error`);
        }
      }
      
      // Format address for display
      const formattedAddress = formatAddress(actualRecipient);
      debugLog(`Using address for display: ${formattedAddress}`);
      
      // Try to get identity from cache
      const cached = identityCache.get(actualRecipient);
      let trader = formattedAddress;
      let nameResolved = false;
      
      // Use cached identity if available
      if (cached?.isResolved && cached.displayName !== formattedAddress) {
        trader = cached.displayName;
        nameResolved = true;
        debugLog(`Using cached identity: ${trader}`);
      }
      
      // Current price status
      debugLog(`Current price status: ${currentPrice !== null ? currentPrice : 'not available'}`);
      
      // Try formatting amount with the most reliable price source
      let usdFormatted = '';
      if (currentPrice !== null) {
        // Format directly using the raw price to avoid any state sync issues
        usdFormatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
          minimumFractionDigits: 0
        }).format(amountRaw * currentPrice);
        debugLog(`USD formatted available: ${usdFormatted}`);
      } else {
        // Fallback to hook's formatter
        usdFormatted = formatAmountToUsd(amountRaw);
        if (usdFormatted) {
          debugLog(`USD formatted from hook: ${usdFormatted}`);
        } else {
          debugLog(`USD price not available, will use backup system`);
        }
      }
      
      // Construct the initial message
      let initialMessage = `${trader} bought $QR`;
      
      // Add USD amount if available
      if (usdFormatted) {
        initialMessage += ` (${usdFormatted})`;
      } else {
        // Store the raw amount in the message for later price resolution
        initialMessage += ` (${amountRaw.toFixed(2)} $QR)`;
        debugLog(`Using tokenized amount as fallback`);
      }
      
      // Store this update for potential future updates
      pendingUpdates.set(messageKey, {
        txHash,
        messageKey,
        amountRaw,
        trader,
        nameResolved
      });
      
      debugLog(`Sending initial message: "${initialMessage}"`);
      
      // Send initial message
      callback(initialMessage, txHash, messageKey);
      
      // If identity not resolved, start async resolution
      if (!nameResolved) {
        debugLog(`Starting async name resolution for ${actualRecipient}`);
        
        getBidderIdentity(actualRecipient).then(resolvedTrader => {
          debugLog(`Name resolved for ${actualRecipient} => ${resolvedTrader}`);
          
          // Only update if the resolved identity is different from the formatted address
          if (resolvedTrader !== formattedAddress) {
            // Check if this update is still in the pending map
            const pendingUpdate = pendingUpdates.get(messageKey);
            
            if (pendingUpdate) {
              debugLog(`Updating pending entry with resolved name: ${resolvedTrader}`);
              
              // Update the trader name in the pending update
              pendingUpdates.set(messageKey, {
                ...pendingUpdate,
                trader: resolvedTrader,
                nameResolved: true
              });
              
              // Construct updated message with resolved name
              let resolvedMessage = `${resolvedTrader} bought $QR`;
              
              // Add USD amount if price is available
              if (currentPrice !== null) {
                const usdValue = new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 0
                }).format(amountRaw * currentPrice);
                
                resolvedMessage += ` (${usdValue})`;
                debugLog(`Added USD value to resolved name message: ${usdValue}`);
                
                // If we have both name and price resolved, we can remove from pending
                pendingUpdates.delete(messageKey);
                debugLog(`Name and price both resolved, removed from pending`);
              } else {
                debugLog(`Price still not available after name resolution`);
              }
              
              debugLog(`Sending updated message with resolved name: "${resolvedMessage}"`);
              
              // Use the same messageKey to ensure it replaces the previous message
              callback(resolvedMessage, txHash, messageKey);
            } else {
              debugLog(`Message ${messageKey} no longer in pending map`);
            }
          } else {
            // Name resolved to the same as formatted address, mark as resolved
            debugLog(`Resolved name is same as formatted address`);
            const pendingUpdate = pendingUpdates.get(messageKey);
            if (pendingUpdate) {
              pendingUpdates.set(messageKey, {
                ...pendingUpdate,
                nameResolved: true
              });
              
              // If we have price, we can remove from pending
              if (currentPrice !== null) {
                pendingUpdates.delete(messageKey);
                debugLog(`Name (unchanged) and price both resolved, removed from pending`);
              }
            }
          }
        }).catch(error => {
          console.error("Error resolving identity:", error);
          
          // Mark as resolved anyway to prevent endless retries
          const pendingUpdate = pendingUpdates.get(messageKey);
          if (pendingUpdate) {
            debugLog(`Error resolving name, marking as resolved anyway`);
            pendingUpdates.set(messageKey, {
              ...pendingUpdate,
              nameResolved: true
            });
            
            // If we have price, we can remove from pending
            if (currentPrice !== null) {
              pendingUpdates.delete(messageKey);
              debugLog(`Error in name resolution but price available, removed from pending`);
            }
          }
        });
      } else if (usdFormatted) {
        // Both name and price are resolved, remove from pending
        pendingUpdates.delete(messageKey);
        debugLog(`Both name and price resolved immediately, removed from pending`);
      }
      
      return true;
    } catch (error) {
      console.error('Error processing swap event:', error, log);
      return false;
    }
  }, [callback, processedIds, formatAmountToUsd, priceUsd, getRawPrice]);

  const fetchTradeActivity = useCallback(async () => {
    try {
      debugLog('Fetching trade activity for $QR Uniswap V3 pool');
      
      // Get current block - reuse the global client
      const currentBlock = await publicClient.getBlockNumber();
      
      // Only get events since the last check, or get more historical events if this is first load
      let fromBlock: bigint;
      
      if (lastCheck > 0n) {
        // Normal update - get events since last check
        fromBlock = lastCheck + 1n;
      } else {
        // First load - get more historical events (24 hours) to ensure we always have events
        fromBlock = currentBlock > INITIAL_HISTORICAL_BLOCKS ? currentBlock - INITIAL_HISTORICAL_BLOCKS : 0n;
        debugLog(`First load - fetching more historical events from block ${fromBlock}`);
      }
      
      if (fromBlock >= currentBlock) {
        debugLog('No new blocks since last check');
        return;
      }
      
      debugLog(`Checking events from block ${fromBlock} to ${currentBlock}`);
      
      // Fetch in smaller chunks to avoid RPC timeouts on large ranges
      const MAX_BLOCK_RANGE = BigInt(10000);
      let processedEvents = 0;
      let buyEventCount = 0;
      const maxBuyEvents = lastCheck === 0n ? 10 : MAX_BUY_EVENTS; // Get at least 10 events on first load
      
      // Process in chunks from newest to oldest
      for (let toBlock = currentBlock; toBlock >= fromBlock && buyEventCount < maxBuyEvents; toBlock = toBlock - MAX_BLOCK_RANGE) {
        const chunkFromBlock = toBlock - MAX_BLOCK_RANGE + 1n > fromBlock ? fromBlock : toBlock - MAX_BLOCK_RANGE + 1n;
        
        debugLog(`Fetching chunk from ${chunkFromBlock} to ${toBlock}`);
        
        try {
          const events = await publicClient.getLogs({
            address: QR_UNISWAP_POOL_ADDRESS,
            event: swapEventAbi,
            fromBlock: chunkFromBlock,
            toBlock
          });
          
          debugLog(`Found ${events.length} events in chunk`);
          processedEvents += events.length;
          
          // Process events in reverse chronological order (newest first)
          for (let i = events.length - 1; i >= 0 && buyEventCount < maxBuyEvents; i--) {
            const isProcessed = await processSwapEvent(events[i] as SwapLog);
            if (isProcessed) buyEventCount++;
          }
          
          // If we have enough buy events, stop fetching more chunks
          if (buyEventCount >= maxBuyEvents) {
            debugLog(`Found enough buy events (${buyEventCount}), stopping chunk processing`);
            break;
          }
        } catch (chunkError) {
          console.error(`Error fetching chunk from ${chunkFromBlock} to ${toBlock}:`, chunkError);
          // Continue with next chunk
        }
      }
      
      debugLog(`Total events processed: ${processedEvents}, buy events: ${buyEventCount}`);
      
      // Update the last check block
      setLastCheck(currentBlock);
    } catch (error) {
      console.error('Error fetching trade activity:', error);
    }
  }, [lastCheck, processSwapEvent]);

  useEffect(() => {
    // Initial fetch
    fetchTradeActivity();
    
    // Set up interval with longer interval to reduce API usage
    const intervalId = setInterval(fetchTradeActivity, FETCH_INTERVAL);
    
    setIsListening(true);
    console.log(`Trade activity listener set up with ${FETCH_INTERVAL/1000}-second interval`);
    
    return () => {
      clearInterval(intervalId);
      setIsListening(false);
      console.log('Trade activity listener cleaned up');
    };
  }, [fetchTradeActivity]);
  
  return { isListening };
}; 