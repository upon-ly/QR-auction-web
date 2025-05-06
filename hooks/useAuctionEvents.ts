import { useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, Address } from 'viem';
import { toast } from 'sonner';
import { getFarcasterUser } from '@/utils/farcaster';
import { getName } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';
import { formatQRAmount } from "@/utils/formatters";

// Define the events we want to monitor
const AuctionBidEvent = parseAbiItem('event AuctionBid(uint256 tokenId, address bidder, uint256 amount, bool extended, uint256 endTime, string urlString, string name)');
const AuctionSettledEvent = parseAbiItem('event AuctionSettled(uint256 tokenId, address winner, uint256 amount, string urlString, string name)');
const AuctionCreatedEvent = parseAbiItem('event AuctionCreated(uint256 tokenId, uint256 startTime, uint256 endTime)');

// ==========================================
// Transaction and Identity Management
// ==========================================

// Keep track of active transactions globally to prevent duplicate toasts
const activeTransactions = new Set<string>();

// Cache identity information to avoid repeated API calls
const identityCache = new Map<string, {displayName: string, timestamp: number}>();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Keep track of recent events for combining toasts
type RecentEvent = {
  type: 'settled' | 'created';
  tokenId: bigint;
  timestamp: number;
  winner?: string;
};
const recentEvents = new Map<string, RecentEvent>();
const COMBINE_WINDOW = 5000; // 5 seconds window to combine events

/**
 * Register a transaction hash to prevent duplicate toasts
 * Call this function immediately after sending a transaction
 */
export function registerTransaction(hash: string): void {
  activeTransactions.add(hash);
  // Remove transaction from active list after 30 seconds
  setTimeout(() => {
    activeTransactions.delete(hash);
  }, 30000); // 30 seconds is enough time for the transaction to be mined and events to be emitted
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
  if (cached && now - cached.timestamp < CACHE_EXPIRY) {
    return cached.displayName;
  }

  try {
    // Format the address for fallback display
    const formattedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    
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
      timestamp: now 
    });
    
    return displayName;
  } catch (error) {
    console.error("Error in getBidderIdentity:", error);
    return `${address.slice(0, 6) || ""}...${address.slice(-4) || ""}`;
  }
}

// ==========================================
// Auction Events Hook
// ==========================================

type UseAuctionEventsProps = {
  onAuctionBid?: (tokenId: bigint, bidder: string, amount: bigint, extended: boolean, endTime: bigint, urlString: string, name: string) => void;
  onAuctionSettled?: (tokenId: bigint, winner: string, amount: bigint, urlString: string, name: string) => void;
  onAuctionCreated?: (tokenId: bigint, startTime: bigint, endTime: bigint) => void;
  showToasts?: boolean;
  tokenId?: bigint;
};

/**
 * Hook to listen for auction events and trigger callbacks/toasts
 * - Monitors auction bids, settlements, and new auctions
 * - Avoids duplicate toasts for the same event
 * - Prevents toasts for the user's own transactions
 * - Resolves bidder addresses to human-readable identities
 */
export function useAuctionEvents({
  onAuctionBid,
  onAuctionSettled,
  onAuctionCreated,
  showToasts = true,
  tokenId,
}: UseAuctionEventsProps) {
  const publicClient = usePublicClient();
  // Use a ref to track which events we've already shown toasts for
  const shownToastsRef = useRef<Record<string, number>>({});

  // Function to check and potentially show a combined toast
  const checkForCombinedToast = (currentEvent: RecentEvent) => {
    const now = Date.now();
    
    // Check if we have a matching event to combine with
    let matchingEventKey: string | null = null;
    let matchingEvent: RecentEvent | null = null;
    
    for (const [key, event] of recentEvents.entries()) {
      // Don't match with self
      if (event.type === currentEvent.type && event.tokenId === currentEvent.tokenId) continue;
      
      // Check if events are within time window and form a valid pair
      if (now - event.timestamp < COMBINE_WINDOW) {
        if (
          (event.type === 'settled' && currentEvent.type === 'created') ||
          (event.type === 'created' && currentEvent.type === 'settled')
        ) {
          matchingEventKey = key;
          matchingEvent = event;
          break;
        }
      }
    }
    
    // If we found a matching event, show a combined toast
    if (matchingEvent && matchingEventKey) {
      // Determine which is settled and which is created
      let settledId: bigint;
      let createdId: bigint;
      
      if (matchingEvent.type === 'settled') {
        settledId = matchingEvent.tokenId;
        createdId = currentEvent.tokenId;
      } else {
        settledId = currentEvent.tokenId;
        createdId = matchingEvent.tokenId;
      }
      
      // Create a unique ID for this combined event
      const combinedEventId = `combined-${settledId.toString()}-${createdId.toString()}`;
      
      // Check if we've shown this toast recently
      if (!shownToastsRef.current[combinedEventId] || now - shownToastsRef.current[combinedEventId] > 5000) {
        const displayMessage = `Auction #${settledId} settled. Auction #${createdId} started!`;
        
        toast.success(
          displayMessage,
          { 
            id: combinedEventId,
            duration: 5000, // Longer display time on mobile
            icon: "🔄"
          }
        );
        
        // Record that we've shown this toast
        shownToastsRef.current[combinedEventId] = now;
      }
      
      // Remove the events we've combined
      recentEvents.delete(matchingEventKey);
      return true; // We showed a combined toast
    }
    
    // No matching event found
    return false;
  };

  useEffect(() => {
    if (!publicClient) return;

    const contractAddress = tokenId 
      ? tokenId >= 1 && tokenId <= 22 
        ? process.env.NEXT_PUBLIC_QRAuction as Address 
        : tokenId >= 23 && tokenId <= 35
          ? process.env.NEXT_PUBLIC_QRAuctionV2 as Address
          : process.env.NEXT_PUBLIC_QRAuctionV3 as Address
      : process.env.NEXT_PUBLIC_QRAuctionV3 as Address;

    // Watch for auction bid events
    const unwatchBid = publicClient.watchEvent({
      address: contractAddress,
      event: AuctionBidEvent,
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { args, transactionHash } = log;
          if (!args) return;
          
          const { tokenId, bidder, amount, extended, endTime, urlString, name } = args;
          
          // Check if this event is from the user's own transaction
          const isUserTransaction = transactionHash && activeTransactions.has(transactionHash);
          
          if (showToasts && !isUserTransaction && tokenId !== undefined && amount !== undefined && bidder !== undefined) {
            // Create a unique ID for this event based on log details
            const eventId = `bid-${tokenId.toString()}-${bidder}-${amount.toString()}`;
            const now = Date.now();
            
            // Only show toast if we haven't shown it in the last 5 seconds
            if (!shownToastsRef.current[eventId] || now - shownToastsRef.current[eventId] > 5000) {
              // Get identity information and then show toast
              getBidderIdentity(bidder).then(displayName => {
                // Check if it's a legacy auction (1-22), v2 auction (23-35), or v3 auction (36+)
                const isLegacyAuction = tokenId <= 22n;
                const isV2Auction = tokenId >= 23n && tokenId <= 35n;
                const isV3Auction = tokenId >= 36n;
                const amount_num = isV3Auction ? Number(amount) / 1e6 : Number(amount) / 1e18;
                
                let bidText = '';
                if (isLegacyAuction) {
                  bidText = `${amount_num.toFixed(3)} ETH`;
                } else if (isV2Auction) {
                  bidText = `${formatQRAmount(amount_num)} $QR`;
                } else if (isV3Auction) {
                  bidText = `$${amount_num.toFixed(2)}`;
                }
                
                toast(`New bid: ${bidText} by ${displayName}`, { 
                  id: eventId,
                  duration: 5000, // Longer display time on mobile
                  icon: "🔔"
                });
                
                // Record that we've shown this toast
                shownToastsRef.current[eventId] = now;
              });
            }
          }
          
          if (onAuctionBid && tokenId && bidder && amount !== undefined && extended !== undefined && endTime !== undefined && urlString !== undefined) {
            onAuctionBid(tokenId, bidder, amount, extended, endTime, urlString, name || "");
          }
        });
      },
    });

    // Watch for auction settled events
    const unwatchSettled = publicClient.watchEvent({
      address: contractAddress,
      event: AuctionSettledEvent,
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { args, transactionHash } = log;
          if (!args) return;
          
          const { tokenId, winner, amount, urlString, name } = args;
          
          // Check if this event is from the user's own transaction
          const isUserTransaction = transactionHash && activeTransactions.has(transactionHash);
          
          if (showToasts && !isUserTransaction && winner && tokenId !== undefined && amount !== undefined) {
            const now = Date.now();
            
            // Create a recent event record for potential combining
            const eventKey = `settled-${tokenId.toString()}`;
            recentEvents.set(eventKey, {
              type: 'settled',
              tokenId,
              timestamp: now,
              winner
            });
            
            // Try to show a combined toast first
            const currentEvent = recentEvents.get(eventKey);
            if (currentEvent && checkForCombinedToast(currentEvent)) {
              // If we showed a combined toast, remove this event and skip individual toast
              recentEvents.delete(eventKey);
            } else {
              // Do not show individual "auction settled" notifications at all
              // This comment intentionally left to show where we removed code
            }
            
            // Clean up old events
            setTimeout(() => {
              recentEvents.delete(eventKey);
            }, COMBINE_WINDOW);
          }
          
          if (onAuctionSettled && tokenId && winner && amount !== undefined && urlString !== undefined) {
            onAuctionSettled(tokenId, winner, amount, urlString, name || "");
          }
        });
      },
    });

    // Watch for auction created events
    const unwatchCreated = publicClient.watchEvent({
      address: contractAddress,
      event: AuctionCreatedEvent,
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { args, transactionHash } = log;
          if (!args) return;
          
          const { tokenId, startTime, endTime } = args;
          
          // Check if this event is from the user's own transaction
          const isUserTransaction = transactionHash && activeTransactions.has(transactionHash);
          
          if (showToasts && !isUserTransaction && tokenId !== undefined) {
            const now = Date.now();
            
            // Create a recent event record for potential combining
            const eventKey = `created-${tokenId.toString()}`;
            recentEvents.set(eventKey, {
              type: 'created',
              tokenId,
              timestamp: now
            });
            
            // Try to show a combined toast first
            const currentEvent = recentEvents.get(eventKey);
            if (currentEvent && checkForCombinedToast(currentEvent)) {
              // If we showed a combined toast, remove this event and skip individual toast
              recentEvents.delete(eventKey);
            } else {
              // In QRAuction contract, new auctions are only created when previous ones settle
              // So we don't show individual "created" notifications, only the combined ones
            }
            
            // Clean up old events
            setTimeout(() => {
              recentEvents.delete(eventKey);
            }, COMBINE_WINDOW);
          }
          
          if (onAuctionCreated && tokenId && startTime !== undefined && endTime !== undefined) {
            onAuctionCreated(tokenId, startTime, endTime);
          }
        });
      },
    });

    // Cleanup function
    return () => {
      unwatchBid();
      unwatchSettled();
      unwatchCreated();
    };
  }, [publicClient, onAuctionBid, onAuctionSettled, onAuctionCreated, showToasts, tokenId]);
} 