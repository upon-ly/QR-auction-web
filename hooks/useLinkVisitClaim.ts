import { useState } from 'react';
import { useLinkVisitEligibility } from './useLinkVisitEligibility';
import { frameSdk } from '@/lib/frame-sdk';

export function useLinkVisitClaim(auctionId: number) {
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const { recordClaim, frameContext, walletAddress } = useLinkVisitEligibility(auctionId);
  const [lastVisitedUrl, setLastVisitedUrl] = useState<string | null>(null);

  // Handle the link click
  const handleLinkClick = async (winningUrl: string): Promise<boolean> => {
    if (!frameContext?.user?.fid) {
      console.log('Cannot handle link click: No FID found');
      return false;
    }

    try {
      console.log('Handling link click for URL:', winningUrl);
      setLastVisitedUrl(winningUrl);
      
      // Record the click in the database
      const response = await fetch('/api/link-click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fid: frameContext.user.fid,
          auctionId: auctionId,
          winningUrl: winningUrl,
          address: walletAddress,
          username: frameContext.user.username || null
        })
      });

      // Log the response for debugging
      const responseText = await response.text();
      console.log('Link click API response:', responseText);
      
      // Parse the response back to JSON
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response JSON:', e);
        return false;
      }

      if (!response.ok || !responseData.success) {
        console.error('Failed to record link click:', responseData.error || 'Unknown error');
        return false;
      }

      // Open the URL with frameSdk
      if (winningUrl) {
        try {
          console.log('Redirecting to URL:', winningUrl);
          await frameSdk.redirectToUrl(winningUrl);
        } catch (error) {
          console.error('Error using frameSdk for redirect, falling back to window.open:', error);
          window.open(winningUrl, '_blank', 'noopener,noreferrer');
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error handling link click:', error);
      return false;
    }
  };

  // Claim the tokens
  const claimTokens = async (): Promise<{ txHash?: string }> => {
    // Validate eligibility
    if (!frameContext?.user?.fid || !walletAddress) {
      console.log('Cannot claim tokens: Missing FID or wallet address');
      return {};
    }

    setIsClaimLoading(true);

    try {
      console.log('Claiming tokens for auction', auctionId);
      
      // Call backend API to execute the token transfer
      const response = await fetch('/api/link-visit/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fid: frameContext.user.fid,
          address: walletAddress,
          auction_id: auctionId,
          username: frameContext.user.username,
          winning_url: lastVisitedUrl || `https://qrcoin.fun/auction/${auctionId}`
        }),
      });

      const data = await response.json();
      console.log('Claim API response:', data);

      if (!response.ok || !data.success) {
        const errorMessage = data.error || 'Failed to claim tokens';
        console.error('Claim API error:', errorMessage);
        return {};
      }

      // Record the claim in our eligibility state
      await recordClaim(data.tx_hash);
      
      console.log('Token claim successful, tx hash:', data.tx_hash);
      
      // Return the transaction hash
      return { txHash: data.tx_hash };
    } catch (error: unknown) {
      console.error('Token claim error:', error);
      return {};
    } finally {
      setIsClaimLoading(false);
    }
  };

  return {
    claimTokens,
    isClaimLoading,
    handleLinkClick
  };
} 