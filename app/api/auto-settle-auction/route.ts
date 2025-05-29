import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

// V3 contract ABI - just the functions we need
const QRAuctionV3_ABI = [
  {
    "type": "function",
    "name": "auction",
    "inputs": [],
    "outputs": [
      {"name": "tokenId", "type": "uint256"},
      {"name": "highestBid", "type": "uint256"},
      {"name": "highestBidder", "type": "address"},
      {"name": "startTime", "type": "uint40"},
      {"name": "endTime", "type": "uint40"},
      {"name": "settled", "type": "bool"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "settleCurrentAndCreateNewAuction",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isWhitelistedSettler",
    "inputs": [{"name": "settler", "type": "address"}],
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view"
  }
] as const;

export async function POST(request: Request) {
  try {
    console.log('[Auto-Settle] API route called');

    // Check authorization (you can add a secret token here)
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.AUTO_SETTLE_SECRET;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get environment variables
    const QR_AUCTION_V3_ADDRESS = process.env.SETTLER_CONTRACT_ADDRESS;
    const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    const SETTLER_PRIVATE_KEY = process.env.SETTLER_PRIVATE_KEY; // Private key of whitelisted settler

    if (!QR_AUCTION_V3_ADDRESS || !ALCHEMY_API_KEY || !SETTLER_PRIVATE_KEY) {
      throw new Error('Missing required environment variables');
    }

    console.log(`[Auto-Settle] Using contract address: ${QR_AUCTION_V3_ADDRESS}`);

    // Create provider for Base mainnet
    const provider = new ethers.JsonRpcProvider(
      `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    );

    // Create wallet from private key
    const wallet = new ethers.Wallet(SETTLER_PRIVATE_KEY, provider);
    
    console.log(`[Auto-Settle] Using settler address: ${wallet.address}`);

    // Create contract instance
    const contract = new ethers.Contract(
      QR_AUCTION_V3_ADDRESS,
      QRAuctionV3_ABI,
      wallet
    );

    // Check if our wallet is whitelisted
    console.log('[Auto-Settle] Checking if settler is whitelisted...');
    const isWhitelisted = await contract.isWhitelistedSettler(wallet.address);
    
    if (!isWhitelisted) {
      console.error(`[Auto-Settle] Settler ${wallet.address} is not whitelisted`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Settler not whitelisted',
          settler: wallet.address 
        },
        { status: 400 }
      );
    }

    console.log('[Auto-Settle] Settler is whitelisted, checking auction status...');

    // Get current auction details
    const auctionData = await contract.auction();
    const currentTime = Math.floor(Date.now() / 1000);

    console.log('[Auto-Settle] Current auction data:', {
      tokenId: auctionData.tokenId.toString(),
      endTime: auctionData.endTime.toString(),
      settled: auctionData.settled,
      currentTime,
      hasEnded: currentTime >= Number(auctionData.endTime)
    });

    // Check if auction has ended and is not settled
    if (currentTime >= Number(auctionData.endTime) && !auctionData.settled) {
      console.log(`[Auto-Settle] Auction #${auctionData.tokenId} has ended and needs settling. Initiating settlement...`);

      // Estimate gas first
      let gasEstimate;
      try {
        gasEstimate = await contract.settleCurrentAndCreateNewAuction.estimateGas();
        console.log(`[Auto-Settle] Gas estimate: ${gasEstimate.toString()}`);
      } catch (estimateError) {
        console.warn('[Auto-Settle] Gas estimation failed:', estimateError);
        gasEstimate = 500000n; // Fallback gas limit
      }

      // Settle the auction with gas settings
      const tx = await contract.settleCurrentAndCreateNewAuction({
        gasLimit: gasEstimate + 50000n, // Add buffer
        maxFeePerGas: ethers.parseUnits('20', 'gwei'), // 20 gwei max
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'), // 2 gwei priority
      });
      
      console.log(`[Auto-Settle] Settlement transaction sent: ${tx.hash}`);

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log(`[Auto-Settle] Settlement confirmed in block ${receipt.blockNumber}`);

      return NextResponse.json({ 
        success: true, 
        message: `Auction #${auctionData.tokenId} settled successfully`,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      });

    } else if (auctionData.settled) {
      console.log(`[Auto-Settle] Auction #${auctionData.tokenId} is already settled`);
      return NextResponse.json({ 
        success: true, 
        message: `Auction #${auctionData.tokenId} is already settled`,
        alreadySettled: true
      });

    } else {
      const timeUntilEnd = Number(auctionData.endTime) - currentTime;
      console.log(`[Auto-Settle] Auction #${auctionData.tokenId} still active. Time until end: ${timeUntilEnd} seconds`);
      
      return NextResponse.json({ 
        success: true, 
        message: `Auction #${auctionData.tokenId} still active`,
        timeUntilEnd,
        stillActive: true
      });
    }

  } catch (error) {
    console.error('[Auto-Settle] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Also allow GET for testing
export async function GET() {
  return NextResponse.json({
    message: 'Auto-settle auction endpoint. Use POST to trigger settlement check.',
    timestamp: new Date().toISOString()
  });
} 