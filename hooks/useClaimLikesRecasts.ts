import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useLikesRecastsEligibility } from './useLikesRecastsEligibility';

interface ClaimResponse {
  success: boolean;
  message?: string;
  error?: string;
  tx_hash?: string;
  signer_approval_needed?: boolean;
  signer_approval_url?: string;
  signer_uuid?: string;
  amount?: number;
  option_type?: string;
}

interface SignerStatus {
  signer_uuid: string;
  status: string;
  public_key: string;
}

export function useClaimLikesRecasts() {
  const [isLoading, setIsLoading] = useState(false);
  const [isClaimLoading, setIsClaimLoading] = useState(false); // Keep for backwards compatibility
  const [isPolling, setIsPolling] = useState(false);
  const [signerApprovalUrl, setSignerApprovalUrl] = useState<string | null>(null);
  const [signerUuid, setSignerUuid] = useState<string | null>(null);
  const [pendingClaim, setPendingClaim] = useState<{
    fid: number;
    address: string;
    username: string | null;
    amount: number;
    option_type: string;
  } | null>(null);
  const { frameContext, walletAddress } = useLikesRecastsEligibility();

  const claimTokens = useCallback(async (
    fid: number,
    address: string,
    username: string | null,
    optionType: string
  ) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/likes-recasts/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fid,
          address,
          username,
          optionType,
        }),
      });

      const data: ClaimResponse = await response.json();

      if (!response.ok || !data.success) {
        // Check if we got a signer approval URL even on "failure"
        if (data.signer_approval_url) {
          return { 
            signer_approval_url: data.signer_approval_url,
            signer_uuid: data.signer_uuid
          };
        }
        throw new Error(data.error || 'Failed to claim tokens');
      }

      // Check if we need signer approval
      if (data.signer_approval_needed && data.signer_approval_url) {
        setSignerApprovalUrl(data.signer_approval_url);
        setSignerUuid(data.signer_uuid!);
        setPendingClaim({
          fid,
          address,
          username,
          amount: data.amount!,
          option_type: data.option_type!
        });
        return { 
          signer_approval_url: data.signer_approval_url,
          signer_uuid: data.signer_uuid
        };
      }

      // If signer_approval_needed is false, existing signer is already approved
      if (data.signer_approval_needed === false && data.signer_uuid) {
        // No approval URL needed, set up for immediate claim
        setSignerUuid(data.signer_uuid);
        setPendingClaim({
          fid,
          address,
          username,
          amount: data.amount!,
          option_type: data.option_type!
        });
        return { 
          signer_approval_needed: false,
          signer_uuid: data.signer_uuid,
          ready_to_claim: true
        };
      }

      // If we get here, airdrop was successful (shouldn't happen with new API)
      return data;

    } catch (error) {
      console.error('Error claiming tokens:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Backwards compatible function
  const claimLikesRecasts = useCallback(async (options: { likesOnly: boolean }): Promise<{ txHash?: string; signer_approval_url?: string; signer_uuid?: string }> => {
    // Check for frame context and wallet address
    if (!frameContext?.user?.fid || !walletAddress) {
      toast.error('User context or wallet address not found');
      throw new Error('Missing frame context or wallet address');
    }

    setIsClaimLoading(true);
    try {
      const result = await claimTokens(
        frameContext.user.fid,
        walletAddress,
        frameContext.user.username || null,
        options.likesOnly ? 'likes' : 'both'
      );
      
      return {
        txHash: 'tx_hash' in result ? result.tx_hash : undefined,
        signer_approval_url: result.signer_approval_url,
        signer_uuid: result.signer_uuid
      };
    } catch (error) {
      console.error('Likes/recasts claim error:', error);
      return {};
    } finally {
      setIsClaimLoading(false);
    }
  }, [frameContext, walletAddress, claimTokens]);

  const checkSignerStatus = useCallback(async (signerUuid: string, isPolling = false): Promise<SignerStatus> => {
    const url = `/api/likes-recasts/signer-status?signer_uuid=${signerUuid}${isPolling ? '&polling=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to check signer status');
    }
    return await response.json();
  }, []);

  const executeAirdrop = useCallback(async (
    fid: number,
    address: string,
    username: string | null,
    signerUuid: string,
    amount: number,
    optionType: string
  ) => {
    const response = await fetch('/api/likes-recasts/execute-airdrop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fid,
        address,
        username,
        signer_uuid: signerUuid,
        amount,
        option_type: optionType,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to execute airdrop');
    }

    return data;
  }, []);

  // Polling effect - only check for approval, don't auto-execute airdrop
  useEffect(() => {
    if (!signerUuid || !pendingClaim) return;

    let intervalId: NodeJS.Timeout;
    let timeoutId: NodeJS.Timeout;
    let pollCount = 0; // Move to outer scope
    const MAX_POLL_COUNT = 300; // 300 * 1 second = 5 minutes max
    setIsPolling(true);

    const checkApprovalStatus = async () => {
      try {
        const signer = await checkSignerStatus(signerUuid, true);
        if (signer.status === 'approved') {
          // Signer is approved - stop polling immediately
          clearInterval(intervalId);
          clearTimeout(timeoutId);
          setIsPolling(false);
          console.log('Signer approved! Ready for manual claim.');
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error during polling:', error);
        throw error;
      }
    };

    const startPolling = async () => {
      // Do immediate check first
      try {
        const isApproved = await checkApprovalStatus();
        if (isApproved) return;
      } catch {
        console.log('Initial approval check failed, continuing with polling');
      }

      // Clear any existing interval before starting new one
      if (intervalId) {
        clearInterval(intervalId);
      }

      intervalId = setInterval(async () => {
        pollCount++;
        
        // Stop polling after maximum attempts
        if (pollCount >= MAX_POLL_COUNT) {
          console.log('Polling timeout - stopping after 5 minutes');
          clearInterval(intervalId);
          setIsPolling(false);
          toast.error('Approval timeout. Please try again.');
          return;
        }
        
        try {
          const isApproved = await checkApprovalStatus();
          if (isApproved) return; // checkApprovalStatus already handles cleanup
        } catch {
          // Stop polling on repeated failures
          if (pollCount % 20 === 0) { // Every 20th attempt (20 seconds)
            console.warn(`Polling failed ${Math.floor(pollCount / 20)} times`);
          }
          
          if (pollCount >= 60) { // After 1 minute of failures
            console.error('Too many polling failures, stopping');
            clearInterval(intervalId);
            setIsPolling(false);
            toast.error('Unable to check approval status. Please refresh and try again.');
            return;
          }
        }
      }, 1000); // Poll every 1 second for faster response
      
      // Set overall timeout (clear any existing timeout first)
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        setIsPolling(false);
        console.log('Overall polling timeout');
        toast.error('Approval check timed out. Please refresh and try again.');
      }, 300000); // 5 minutes total timeout
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setIsPolling(false);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else if (signerUuid && pendingClaim) {
        // Reset poll count when returning to tab and restart
        pollCount = 0;
        console.log('Tab became visible, restarting polling');
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [signerUuid, pendingClaim, checkSignerStatus]);

  // Manual claim execution function
  const executeClaimAirdrop = useCallback(async () => {
    if (!pendingClaim || !signerUuid) {
      throw new Error('No pending claim or signer UUID');
    }

    try {
      const result = await executeAirdrop(
        pendingClaim.fid,
        pendingClaim.address,
        pendingClaim.username,
        signerUuid,
        pendingClaim.amount,
        pendingClaim.option_type
      );
      
      // Clear pending state after successful airdrop
      setSignerApprovalUrl(null);
      setSignerUuid(null);
      setPendingClaim(null);
      
      return result;
      
    } catch (airdropError) {
      console.error('Error executing airdrop:', airdropError);
      throw airdropError;
    }
  }, [pendingClaim, signerUuid, executeAirdrop]);

  // Check if signer is approved
  const isSignerApproved = useCallback(async (signerUuid: string): Promise<boolean> => {
    try {
      const signer = await checkSignerStatus(signerUuid);
      return signer.status === 'approved';
    } catch (error) {
      console.error('Error checking signer approval:', error);
      return false;
    }
  }, [checkSignerStatus]);

  const clearApprovalState = useCallback(() => {
    setSignerApprovalUrl(null);
    setSignerUuid(null);
    setPendingClaim(null);
    setIsPolling(false);
  }, []);

  return {
    claimTokens,
    isLoading,
    isClaimLoading,
    isPolling,
    signerApprovalUrl,
    signerUuid,
    pendingClaim,
    clearApprovalState,
    claimLikesRecasts,
    executeClaimAirdrop,
    isSignerApproved,
  };
} 