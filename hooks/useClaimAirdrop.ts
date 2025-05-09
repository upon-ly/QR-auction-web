import { useState } from 'react';
import { toast } from 'sonner';
import { useAirdropEligibility } from './useAirdropEligibility';

export function useClaimAirdrop() {
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const { recordClaim, frameContext, walletAddress } = useAirdropEligibility();

  const claimAirdrop = async (): Promise<{ txHash?: string }> => {
    // Check for frame context and wallet address
    if (!frameContext?.user?.fid || !walletAddress) {
      toast.error('Wallet not connected properly. Try reloading the app.');
      return {};
    }

    setIsClaimLoading(true);

    try {
      // Call backend API to execute the airdrop
      const response = await fetch('/api/airdrop/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fid: frameContext.user.fid,
          address: walletAddress,
          // Pass along the notifications status from frame context
          hasNotifications: !!frameContext.client?.notificationDetails,
          // Pass username for test user detection
          username: frameContext.user.username
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to claim airdrop');
      }

      // Record the claim in local state
      await recordClaim(data.tx_hash);
      
      // Return the transaction hash (even though we don't show it anymore)
      return { txHash: data.tx_hash };
    } catch (error: unknown) {
      console.error('Airdrop claim error:', error);
      // Only show errors if needed - currently we don't show errors to the user
      // as we're using instant success UI approach
      // toast.error(error instanceof Error ? error.message : 'Failed to claim airdrop');
      return {};
    } finally {
      setIsClaimLoading(false);
    }
  };

  return {
    claimAirdrop,
    isClaimLoading
  };
} 