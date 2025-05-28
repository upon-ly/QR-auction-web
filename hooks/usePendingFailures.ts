import { useState, useEffect } from 'react';
import { frameSdk } from '@/lib/frame-sdk';

interface PendingFailuresResult {
  hasPendingFailures: boolean;
  isLoading: boolean;
  error: string | null;
  mostRecentFailure: {
    id: string;
    created_at: string;
  } | null;
}

export function usePendingFailures(
  ethAddress?: string | null,
  auctionId?: number | null
): PendingFailuresResult {
  const [result, setResult] = useState<PendingFailuresResult>({
    hasPendingFailures: false,
    isLoading: true,
    error: null,
    mostRecentFailure: null
  });

  useEffect(() => {
    let isMounted = true;

    const checkPendingFailures = async () => {
      try {
        // Get frame context for FID
        const frameContext = await frameSdk.getContext();
        if (!frameContext?.user?.fid) {
          if (isMounted) {
            setResult({
              hasPendingFailures: false,
              isLoading: false,
              error: 'No user context found',
              mostRecentFailure: null
            });
          }
          return;
        }

        // Build query parameters
        const params = new URLSearchParams({
          fid: frameContext.user.fid.toString()
        });

        if (ethAddress) {
          params.append('eth_address', ethAddress);
        }

        if (auctionId !== null && auctionId !== undefined) {
          params.append('auction_id', auctionId.toString());
        }

        // Call the API
        const response = await fetch(`/api/check-pending-failures?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to check pending failures');
        }

        if (isMounted) {
          setResult({
            hasPendingFailures: data.hasPendingFailures || false,
            isLoading: false,
            error: null,
            mostRecentFailure: data.mostRecentFailure || null
          });
        }

      } catch (error) {
        console.error('Error checking pending failures:', error);
        if (isMounted) {
          setResult({
            hasPendingFailures: false, // Default to false on error to not block popups unnecessarily
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            mostRecentFailure: null
          });
        }
      }
    };

    // Only check if we have the necessary data
    if (ethAddress !== undefined) {
      checkPendingFailures();
    } else {
      // If no eth address yet, keep loading
      setResult(prev => ({ ...prev, isLoading: true }));
    }

    return () => {
      isMounted = false;
    };
  }, [ethAddress, auctionId]);

  return result;
} 