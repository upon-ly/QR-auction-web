/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { Address, encodeFunctionData } from "viem";
import { useWriteContract } from "wagmi";
import { USDC_TOKEN_ADDRESS } from "@/config/tokens";
import { frameSdk } from "@/lib/frame-sdk-singleton";
import { useEffect, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useIsMiniApp } from "@/hooks/useIsMiniApp";

// ERC20 ABI for token approval
const erc20ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export function useWriteActions({ tokenId }: { tokenId: bigint }) {
  // Setup contract writes
  const { writeContractAsync: bidAuction } = useWriteContract();
  const { writeContractAsync: settleAndCreate } = useWriteContract();
  const { writeContractAsync: approveToken } = useWriteContract();
  
  // Get user info from Privy to capture Twitter username
  const { user } = usePrivy();
  
  // Get Twitter username from user's linked accounts
  const twitterUsername = useMemo(() => {
    if (user?.linkedAccounts) {
      const twitterAccount = user.linkedAccounts.find((account: any) => account.type === 'twitter_oauth');
      return (twitterAccount as { username?: string })?.username || null;
    }
    return null;
  }, [user?.linkedAccounts]);
  
  // Use the hook to detect if we're in a mini app
  const { isMiniApp } = useIsMiniApp();

  // Determine which auction version we're dealing with
  const isLegacyAuction = tokenId <= 22n;
  const isV2Auction = tokenId >= 23n && tokenId <= 61n;

  // For V1 and V2 auctions, provide disabled versions of the functions
  if (isLegacyAuction || isV2Auction) {
    const readOnlyMessage = `Auction #${tokenId} is read-only. Only the latest V3 auctions can be interacted with.`;
    
    return {
      bidAmount: async () => {
        throw new Error(readOnlyMessage);
      },
      settleTxn: async () => {
        throw new Error(readOnlyMessage);
      }
    };
  }
  
  // Only V3 auctions can be interacted with
  const bidAmount = async ({
    value,
    urlString,
    smartWalletClient,
    onPhaseChange
  }: {
    value: bigint;
    urlString: string;
    smartWalletClient?: any;
    onPhaseChange?: (phase: 'approving' | 'confirming' | 'executing') => void;
  }) => {
    try {
      console.log(`Bidding on V3 auction #${tokenId.toString()}`);
      console.log(`Using USDC token, address: ${USDC_TOKEN_ADDRESS}`);
      
      // Determine the name to use - Twitter username for website users, empty for frame users
      const bidderName = isMiniApp ? "" : (twitterUsername || "");
      console.log("Using bidder name:", bidderName);
      
      // Check if we're in a Farcaster frame context
      console.log("Bidding environment:", { isMiniApp });
      
      // Check if we have a smart wallet client
      if (smartWalletClient) {
        console.log("Using smart wallet for transaction");
        
        // First approve USDC tokens to be spent by the auction contract using the smart wallet
        console.log("Approving USDC tokens with smart wallet:", value.toString());
        
        // Use smart wallet for approval
        const approveTxData = {
          address: USDC_TOKEN_ADDRESS as Address,
          abi: erc20ABI,
          functionName: "approve",
          args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value],
        };
        
        const approveTx = await smartWalletClient.writeContract(approveTxData);
        console.log("Smart wallet approval tx:", approveTx);
        
        // Wait for approval to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        onPhaseChange?.('executing');
        
        // Use the 3-parameter version of createBid with Twitter username
        console.log("Placing bid with smart wallet, URL:", urlString, "Name:", bidderName);
        
        const bidTxData = {
          address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
          abi: QRAuctionV3.abi,
          functionName: "createBid",
          args: [tokenId, urlString, bidderName], // Use Twitter username as name parameter
        };
        
        const tx = await smartWalletClient.writeContract(bidTxData);
        return tx;
      } else if (isMiniApp && await frameSdk.isWalletConnected()) {
        // Use Farcaster SDK for bidding in frames
        try {
          console.log("Using Farcaster SDK for bidding");
          onPhaseChange?.('approving');
          
          // Get connected accounts
          const accounts = await frameSdk.connectWallet();
          
          if (accounts.length === 0) {
            throw new Error("No Farcaster wallet connected");
          }
          
          const fromAddress = accounts[0];
          console.log("Using Farcaster wallet address:", fromAddress);
          
          // First need to approve USDC spending
          console.log("Approving USDC tokens with Farcaster wallet:", value.toString());
          
          // Properly encode approval call data
          const approveData = encodeFunctionData({
            abi: erc20ABI,
            functionName: "approve",
            args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value]
          });
          
          // Create approval transaction parameters
          const approveTxParams = {
            from: fromAddress as `0x${string}`,
            to: USDC_TOKEN_ADDRESS as `0x${string}`,
            data: approveData,
          };
          
          // Get direct access to SDK methods using our wrapper
          // Get the ethProvider from our wrapper
          if (!frameSdk.isWalletConnected) {
            throw new Error("Farcaster SDK wallet not available");
          }
          
          // Use native JS SDK methods if needed
          const { wallet } = await import("@farcaster/frame-sdk").then(module => module.default);
          
          if (!wallet?.ethProvider) {
            throw new Error("Farcaster ethProvider not available");
          }
          
          // Send approval transaction
          const approveTxHash = await wallet.ethProvider.request({
            method: "eth_sendTransaction",
            params: [approveTxParams],
          });
          
          console.log("Farcaster USDC approval transaction sent:", approveTxHash);
          
          // Wait for approval confirmation
          onPhaseChange?.('confirming');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Now create the bid transaction
          onPhaseChange?.('executing');
          
          // Encode bid function call data (tokenId, urlString, name)
          const bidData = encodeFunctionData({
            abi: QRAuctionV3.abi,
            functionName: "createBid",
            args: [tokenId, urlString, bidderName] // Use empty string for frame users
          });
          
          // Create bid transaction parameters
          const bidTxParams = {
            from: fromAddress as `0x${string}`,
            to: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
            data: bidData,
          };
          
          // Send bid transaction
          const bidTxHash = await wallet.ethProvider.request({
            method: "eth_sendTransaction",
            params: [bidTxParams],
          });
          
          console.log("Farcaster bid transaction sent:", bidTxHash);
          return bidTxHash;
        } catch (farcasterError) {
          console.error("Farcaster bidding error:", farcasterError);
          console.log("Falling back to regular bidding");
          // Fall through to regular EOA path
        }
      }
      
      // Use regular EOA wallet - this path still needs approval
      console.log("Using EOA wallet for transaction");
      
      // Notify that we're in approval phase
      onPhaseChange?.('approving');
      
      // First approve USDC tokens to be spent by the auction contract
      console.log("Approving USDC tokens with EOA:", value.toString());
      const approveTx = await approveToken({
        address: USDC_TOKEN_ADDRESS as Address,
        abi: erc20ABI,
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value],
      });
      
      console.log("Approval tx:", approveTx);

      // Wait for approval to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Notify that we're in confirmation phase
      onPhaseChange?.('confirming');
      
      // Use the 3-parameter version of createBid with Twitter username
      console.log("Placing bid with EOA, URL:", urlString, "Name:", bidderName);
      const tx = await bidAuction({
        address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
        abi: QRAuctionV3.abi,
        functionName: "createBid",
        args: [tokenId, urlString, bidderName], // Use Twitter username as name parameter
      });

      // After submitting the transaction, move to executing phase
      onPhaseChange?.('executing');
      return tx;
    } catch (error: any) {
      console.error("Bid error:", error);
      throw error;
    }
  };

  const settleTxn = async ({ smartWalletClient }: { smartWalletClient?: any } = {}) => {
    try {
      console.log(`Settling V3 auction #${tokenId.toString()}`);
      
      console.log("navigator.userAgent", navigator.userAgent);
      // Check if we're in a frame context
      console.log("Settlement environment:", { isMiniApp });
      
      if (smartWalletClient) {
        console.log("Using smart wallet for settlement");
        
        const settleTxData = {
          address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
          abi: QRAuctionV3.abi,
          functionName: "settleCurrentAndCreateNewAuction",
          args: [],
        };
        
        const tx = await smartWalletClient.writeContract(settleTxData);
        
        // Trigger retry webhook for the settled auction after successful settlement
        try {
          const webhookResponse = await fetch('/api/webhook/auction-settled', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              settledAuctionId: tokenId.toString(),
              newAuctionId: (tokenId + 1n).toString()
            })
          });
          
          if (webhookResponse.ok) {
            console.log(`Retry webhook triggered for settled auction ${tokenId} (smart wallet)`);
          } else {
            console.error('Failed to trigger retry webhook (smart wallet):', await webhookResponse.text());
          }
        } catch (webhookError) {
          console.error('Error triggering retry webhook (smart wallet):', webhookError);
        }
        
        return tx;
      } else if (isMiniApp && await frameSdk.isWalletConnected()) {
        // Use Farcaster SDK for settlement in frames
        try {
          console.log("Using Farcaster SDK for settlement");
          
          // Get connected accounts
          const accounts = await frameSdk.connectWallet();
          
          if (accounts.length === 0) {
            throw new Error("No Farcaster wallet connected");
          }
          
          const fromAddress = accounts[0];
          console.log("Using Farcaster wallet address:", fromAddress);
          
          // Get direct access to SDK methods using our wrapper
          // Get the ethProvider from our wrapper
          if (!frameSdk.isWalletConnected) {
            throw new Error("Farcaster SDK wallet not available");
          }
          
          // Use native JS SDK methods if needed
          const { wallet } = await import("@farcaster/frame-sdk").then(module => module.default);
          
          if (!wallet?.ethProvider) {
            throw new Error("Farcaster ethProvider not available");
          }
          
          // Encode settlement function call data (no parameters needed)
          const settleData = encodeFunctionData({
            abi: QRAuctionV3.abi,
            functionName: "settleCurrentAndCreateNewAuction",
            args: []
          });
          
          // Create transaction parameters
          const txParams = {
            from: fromAddress as `0x${string}`,
            to: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
            data: settleData,
          };
          
          // Send transaction
          const txHash = await wallet.ethProvider.request({
            method: "eth_sendTransaction",
            params: [txParams],
          });
          
          console.log("Farcaster settlement transaction sent:", txHash);
          
          // Trigger retry webhook for the settled auction after successful settlement
          try {
                      const webhookResponse = await fetch('/api/webhook/auction-settled', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              settledAuctionId: tokenId.toString(),
              newAuctionId: (tokenId + 1n).toString()
            })
          });
            
            if (webhookResponse.ok) {
              console.log(`Retry webhook triggered for settled auction ${tokenId} (frame)`);
            } else {
              console.error('Failed to trigger retry webhook (frame):', await webhookResponse.text());
            }
          } catch (webhookError) {
            console.error('Error triggering retry webhook (frame):', webhookError);
          }
          
          return txHash;
        } catch (farcasterError) {
          console.error("Farcaster settlement error:", farcasterError);
          console.log("Falling back to regular settlement");
          // Fall through to regular EOA path
        }
      }
      
      // If we're here, either we're not in Warpcast or the Warpcast settlement failed
      console.log("Using regular EOA wallet for settlement via useWriteContract");
      console.log("Contract address:", process.env.NEXT_PUBLIC_QRAuctionV3);
      
      try {
        const tx = await settleAndCreate({
          address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
          abi: QRAuctionV3.abi,
          functionName: "settleCurrentAndCreateNewAuction",
          args: [],
        });
        
        console.log("Transaction successful:", tx);
        
        // Trigger retry webhook for the settled auction after successful settlement
        try {
          // Call webhook to process failed claims for the settled auction
                      const webhookResponse = await fetch('/api/webhook/auction-settled', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                settledAuctionId: tokenId.toString(),
                newAuctionId: (tokenId + 1n).toString()
              })
            });
          
          if (webhookResponse.ok) {
            console.log(`Retry webhook triggered for settled auction ${tokenId}`);
          } else {
            console.error('Failed to trigger retry webhook:', await webhookResponse.text());
          }
        } catch (webhookError) {
          console.error('Error triggering retry webhook:', webhookError);
          // Don't throw - settlement was successful even if webhook failed
        }
        
        return tx;
      } catch (error: any) {
        console.error("Settlement transaction error:", error);
        console.error("Error message:", error.message);
        console.error("Error details:", JSON.stringify(error, null, 2));
        throw error;
      }
    } catch (error: any) {
      console.error("Settlement error:", error);
      throw error;
    }
  };

  return { bidAmount, settleTxn };
}
