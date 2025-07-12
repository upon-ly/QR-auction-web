import { useState, useEffect } from 'react';
import { useLinkVisitEligibility } from './useLinkVisitEligibility';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";

export function useLinkVisitClaim(auctionId: number, isWebContext: boolean = false) {
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const { recordClaim, frameContext, walletAddress } = useLinkVisitEligibility(auctionId, isWebContext);
  const [lastVisitedUrl, setLastVisitedUrl] = useState<string | null>(null);
  const [expectedClaimAmount, setExpectedClaimAmount] = useState<number>(0);
  const [isCheckingAmount, setIsCheckingAmount] = useState(false);
  const [hasCheckedAmount, setHasCheckedAmount] = useState(false);

  // Web-specific hooks
  const { authenticated, user, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { address } = useAccount();
  const { client: smartWalletClient } = useSmartWallets();
  
  // Get smart wallet address from user's linked accounts (more reliable)
  const smartWalletAddress = user?.linkedAccounts?.find((account: { type: string; address?: string }) => account.type === 'smart_wallet')?.address;
  
  // Use appropriate wallet address based on context - prioritize smart wallet for web users
  const effectiveWalletAddress = isWebContext 
    ? (smartWalletAddress || smartWalletClient?.account?.address || address)
    : walletAddress;

  // Get Twitter username for web context
  const getTwitterUsername = () => {
    if (!isWebContext || !authenticated || !user?.linkedAccounts) {
      return null;
    }
    
    const twitterAccount = user.linkedAccounts.find((account: { type: string; username?: string }) => 
      account.type === 'twitter_oauth'
    );
    
    return twitterAccount?.username || null;
  };

  // Fetch expected claim amount based on wallet holdings (web) or score (mini-app)
  useEffect(() => {
    async function fetchExpectedAmount() {
      // Skip if no wallet address
      if (!effectiveWalletAddress) {
        setExpectedClaimAmount(0);
        setHasCheckedAmount(false);
        return;
      }
      
      // For web/mobile users, check wallet balance to determine amount  
      if (isWebContext) {
        setIsCheckingAmount(true);
        try {
          const response = await fetch('/api/link-visit/check-amount', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              address: effectiveWalletAddress,
              claimSource: 'web',
              fid: frameContext?.user?.fid
            })
          });
          
          const data = await response.json();
          if (data.success && data.amount) {
            setExpectedClaimAmount(data.amount);
            setHasCheckedAmount(true);
            console.log(`💰 Dynamic claim amount for ${effectiveWalletAddress}: ${data.amount} QR`);
          }
        } catch (error) {
          console.error('Error fetching dynamic claim amount:', error);
          // Keep default amount on error
        } finally {
          setIsCheckingAmount(false);
        }
      } else if (frameContext?.user?.fid) {
        // Mini-app users: Also check amount dynamically based on Neynar score
        setIsCheckingAmount(true);
        try {
          const response = await fetch('/api/link-visit/check-amount', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              address: effectiveWalletAddress || '',
              claimSource: 'mini_app',
              fid: frameContext.user.fid
            })
          });
          
          const data = await response.json();
          if (data.success && data.amount) {
            setExpectedClaimAmount(data.amount);
            setHasCheckedAmount(true);
            console.log(`💰 Dynamic claim amount for FID ${frameContext.user.fid}: ${data.amount} QR`);
          }
        } catch (error) {
          console.error('Error fetching dynamic claim amount:', error);
          // Keep default amount on error
          setExpectedClaimAmount(100);
        } finally {
          setIsCheckingAmount(false);
        }
      }
    }
    
    fetchExpectedAmount();
  }, [isWebContext, frameContext?.user?.fid, effectiveWalletAddress]);

  // Handle the link click
  const handleLinkClick = async (winningUrl: string): Promise<boolean> => {
    if (isWebContext) {
      // Web context: use wallet address
      if (!effectiveWalletAddress) {
        console.log('Cannot handle link click: No wallet address found');
        return false;
      }

      try {
        console.log('Handling web link click for URL:', winningUrl);
        setLastVisitedUrl(winningUrl);

        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        const effectiveFid = -(hashNumber % 1000000000);
        
        // Get Twitter username for web context
        const twitterUsername = getTwitterUsername();
        
        // Record the click in the database
        const response = await fetch('/api/link-click', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fid: effectiveFid, // Negative wallet address-based FID for web users
            auctionId: auctionId,
            winningUrl: winningUrl,
            address: effectiveWalletAddress,
            username: twitterUsername,
            claimSource: 'web'
          })
        });

        // Log the response for debugging
        const responseText = await response.text();
        console.log('Web link click API response:', responseText);
        
        // Parse the response back to JSON
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse response JSON:', e);
          return false;
        }

        if (!response.ok || !responseData.success) {
          console.error('Failed to record web link click:', responseData.error || 'Unknown error');
          return false;
        }

        // For web context, we handle link opening differently
        if (winningUrl) {
          try {
            console.log('Opening URL in new tab:', winningUrl);
            window.open(winningUrl, '_blank', 'noopener,noreferrer');
          } catch (error) {
            console.error('Error opening URL:', error);
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error handling web link click:', error);
        return false;
      }
    } else {
      // Mini-app context: use FID (existing logic)
      if (!frameContext?.user?.fid) {
        console.log('Cannot handle link click: No FID found');
        return false;
      }

      try {
        console.log('Handling mini-app link click for URL:', winningUrl);
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
            address: effectiveWalletAddress,
            username: frameContext.user.username || null,
            claimSource: 'mini_app'
          })
        });

        // Log the response for debugging
        const responseText = await response.text();
        console.log('Mini-app link click API response:', responseText);
        
        // Parse the response back to JSON
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse response JSON:', e);
          return false;
        }

        if (!response.ok || !responseData.success) {
          console.error('Failed to record mini-app link click:', responseData.error || 'Unknown error');
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
        console.error('Error handling mini-app link click:', error);
        return false;
      }
    }
  };

  // Claim the tokens
  const claimTokens = async (captchaToken?: string): Promise<{ txHash?: string }> => {
    if (isWebContext) {
      // Web context: validate wallet connection
      if (!effectiveWalletAddress || !authenticated) {
        console.log('Cannot claim tokens: Missing wallet address or not authenticated');
        return {};
      }
      
      // Add debug logging to show which address we're using
      console.log('🔍 Web context address selection:', {
        smartWalletAddress: smartWalletAddress,
        smartWalletClientAddress: smartWalletClient?.account?.address,
        eoaAddress: address,
        effectiveAddress: effectiveWalletAddress,
        isUsingSmartWallet: Boolean(smartWalletAddress || smartWalletClient?.account?.address)
      });
    } else {
      // Mini-app context: validate FID and wallet
      if (!frameContext?.user?.fid || !effectiveWalletAddress) {
        console.log('Cannot claim tokens: Missing FID or wallet address');
        return {};
      }
    }

    setIsClaimLoading(true);

    try {
      console.log('Claiming tokens for auction', auctionId, 'context:', isWebContext ? 'web' : 'mini-app');
      
      // Add final confirmation of the address being used for airdrop
      console.log('💰 AIRDROP TARGET ADDRESS:', effectiveWalletAddress, isWebContext ? '(web - should be smart wallet if available)' : '(mini-app)');
      
      // Get Twitter username for web context
      const twitterUsername = isWebContext ? getTwitterUsername() : frameContext?.user?.username;
      
      // Calculate FID for web context
      const webFid = isWebContext ? (() => {
        const addressHash = effectiveWalletAddress?.slice(2).toLowerCase();
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        return -(hashNumber % 1000000000);
      })() : frameContext?.user?.fid;
      
      // Detect if this is a Coinbase Wallet client (mini-app context only)
      let clientFid: number | null = null;
      
      if (!isWebContext && frameContext) {
        try {
          const fullFrameContext = await frameSdk.getContext();
          clientFid = fullFrameContext?.client?.clientFid || null;
        } catch (error) {
          console.warn('Failed to get frame context for clientFid detection:', error);
        }
      }
      
      // Get Privy auth token for web users to verify authentication
      let authToken: string | undefined;
      if (isWebContext && authenticated) {
        try {
          authToken = await getAccessToken();
        } catch (error) {
          console.error('Failed to get Privy auth token:', error);
          // Continue without token - backend will reject if needed
        }
      }
      
      // Call backend API to execute the token transfer
      const response = await fetch('/api/link-visit/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_LINK_CLICK_API_KEY || '',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          ...(identityToken ? { 'x-privy-id-token': identityToken } : {})
        },
        body: JSON.stringify({
          fid: webFid,
          address: effectiveWalletAddress,
          auction_id: auctionId,
          username: twitterUsername,
          winning_url: lastVisitedUrl || `https://qrcoin.fun/auction/${auctionId}`,
          claim_source: isWebContext ? 'web' : 'mini_app',
          captcha_token: captchaToken, // Add captcha token
          client_fid: clientFid // Add client FID for Coinbase Wallet detection
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
    handleLinkClick,
    expectedClaimAmount,
    isCheckingAmount,
    hasCheckedAmount
  };
} 