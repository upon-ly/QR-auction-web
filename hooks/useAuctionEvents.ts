import { useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, Address } from 'viem';
import { toast } from 'sonner';
import { getFarcasterUser } from '@/utils/farcaster';
import { getName } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';

// Define the events we want to monitor
const AuctionBidEvent = parseAbiItem('event AuctionBid(uint256 tokenId, address bidder, uint256 amount, bool extended, uint256 endTime, string urlString)');
const AuctionSettledEvent = parseAbiItem('event AuctionSettled(uint256 tokenId, address winner, uint256 amount, string urlString)');
const AuctionCreatedEvent = parseAbiItem('event AuctionCreated(uint256 tokenId, uint256 startTime, uint256 endTime)');

// ==========================================
// Transaction and Identity Management
// ==========================================

// Keep track of active transactions globally to prevent duplicate toasts
const activeTransactions = new Set<string>();

// Cache identity information to avoid repeated API calls
const identityCache = new Map<string, {displayName: string, timestamp: number}>();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

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
  onAuctionBid?: (tokenId: bigint, bidder: string, amount: bigint, extended: boolean, endTime: bigint) => void;
  onAuctionSettled?: (tokenId: bigint, winner: string, amount: bigint) => void;
  onAuctionCreated?: (tokenId: bigint, startTime: bigint, endTime: bigint) => void;
  showToasts?: boolean;
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
}: UseAuctionEventsProps) {
  const publicClient = usePublicClient();
  // Use a ref to track which events we've already shown toasts for
  const shownToastsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!publicClient) return;

    const contractAddress = process.env.NEXT_PUBLIC_QRAuction as Address;

    // Watch for auction bid events
    const unwatchBid = publicClient.watchEvent({
      address: contractAddress,
      event: AuctionBidEvent,
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { args, transactionHash } = log;
          if (!args) return;
          
          const { tokenId, bidder, amount, extended, endTime } = args;
          
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
                toast(`New bid: ${Number(amount) / 1e18} ETH by ${displayName}`, { 
                  id: eventId,
                  // Use custom style for bid toasts
                  className: "bg-gray-50 text-gray-800 border border-gray-200",
                  icon: "🔔"
                });
                
                // Record that we've shown this toast
                shownToastsRef.current[eventId] = now;
              });
            }
          }
          
          if (onAuctionBid && tokenId && bidder && amount !== undefined && extended !== undefined && endTime) {
            onAuctionBid(tokenId, bidder, amount, extended, endTime);
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
          
          const { tokenId, winner, amount } = args;
          
          // Check if this event is from the user's own transaction
          const isUserTransaction = transactionHash && activeTransactions.has(transactionHash);
          
          if (showToasts && !isUserTransaction && winner && tokenId !== undefined && amount !== undefined) {
            // Create a unique ID for this event
            const eventId = `settled-${tokenId.toString()}-${winner}-${amount.toString()}`;
            const now = Date.now();
            
            // Only show toast if we haven't shown it in the last 5 seconds
            if (!shownToastsRef.current[eventId] || now - shownToastsRef.current[eventId] > 5000) {
              // Get identity information and then show toast
              getBidderIdentity(winner).then(displayName => {
                toast.success(
                  `Auction #${tokenId} settled! Won by ${displayName}`,
                  { id: eventId }
                );
                
                // Record that we've shown this toast
                shownToastsRef.current[eventId] = now;
              });
            }
          }
          
          if (onAuctionSettled && tokenId && winner && amount !== undefined) {
            onAuctionSettled(tokenId, winner, amount);
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
            // Create a unique ID for this event
            const eventId = `created-${tokenId.toString()}`;
            const now = Date.now();
            
            // Only show toast if we haven't shown it in the last 5 seconds
            if (!shownToastsRef.current[eventId] || now - shownToastsRef.current[eventId] > 5000) {
              toast.success(
                `New auction #${tokenId} created!`,
                { id: eventId }
              );
              // Record that we've shown this toast
              shownToastsRef.current[eventId] = now;
            }
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
  }, [publicClient, onAuctionBid, onAuctionSettled, onAuctionCreated, showToasts]);
} 