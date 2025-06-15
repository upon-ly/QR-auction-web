import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import QRAuctionV3 from '@/abi/QRAuctionV3.json';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Retry-specific contract addresses (separate from regular claims)
const RETRY_AIRDROP_CONTRACT_ADDRESS = process.env.RETRY_AIRDROP_CONTRACT_ADDRESS || '';
const RETRY_ADMIN_PRIVATE_KEY = process.env.RETRY_ADMIN_PRIVATE_KEY || '';
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';

// Alchemy RPC URL
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// ERC20 ABI for token operations
const ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Batch size for processing claims
const BATCH_SIZE = 50;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  try {
    // Verify authorization (you can add more security here)
    const authHeader = req.headers.get('authorization');
    const expectedAuth = process.env.RETRY_ENDPOINT_SECRET || 'retry-secret-key';
    
    if (authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { auctionId } = await req.json();
    
    if (!auctionId) {
      return NextResponse.json({ success: false, error: 'Auction ID required' }, { status: 400 });
    }

    console.log(`Starting batch retry for auction ${auctionId}`);

    // Validate environment variables
    if (!RETRY_AIRDROP_CONTRACT_ADDRESS || !RETRY_ADMIN_PRIVATE_KEY) {
      console.error('Missing retry-specific environment variables');
      return NextResponse.json({ 
        success: false, 
        error: 'Retry configuration missing' 
      }, { status: 500 });
    }

    // Initialize provider to check current auction
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Security check: Only allow retries for the most recently settled auction
    try {
      const auctionContract = new ethers.Contract(
        process.env.NEXT_PUBLIC_QRAuctionV3 as string,
        QRAuctionV3.abi,
        provider
      );
      
      // Get current auction ID from contract
      const currentAuctionId = await auctionContract.auctionCounter();
      const expectedSettledAuctionId = currentAuctionId - 1n; // The auction that just settled
      
      console.log(`Current auction: ${currentAuctionId}, Requested retry for: ${auctionId}, Expected settled: ${expectedSettledAuctionId}`);
      
      // Only allow retries for the auction that just settled (current - 1)
      if (BigInt(auctionId) !== expectedSettledAuctionId) {
        console.error(`Security check failed: Can only retry the most recently settled auction (${expectedSettledAuctionId}), requested: ${auctionId}`);
        return NextResponse.json({ 
          success: false, 
          error: `Can only retry the most recently settled auction (${expectedSettledAuctionId.toString()})`,
          currentAuction: currentAuctionId.toString(),
          requestedAuction: auctionId,
          allowedAuction: expectedSettledAuctionId.toString()
        }, { status: 403 });
      }
      
      console.log(`Security check passed: Retrying auction ${auctionId} (most recently settled)`);
    } catch (contractError) {
      console.error('Failed to verify auction state:', contractError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to verify auction state' 
      }, { status: 500 });
    }

    // Initialize admin wallet (reuse provider from security check)
    const adminWallet = new ethers.Wallet(RETRY_ADMIN_PRIVATE_KEY, provider);

    console.log(`Using retry wallet: ${adminWallet.address}`);
    console.log(`Using retry airdrop contract: ${RETRY_AIRDROP_CONTRACT_ADDRESS}`);

    // Get all failures for this auction that haven't been successfully processed
    const { data: failures, error: fetchError } = await supabase
      .from('link_visit_claim_failures')
      .select('*')
      .eq('auction_id', auctionId.toString())
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch failures:', fetchError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch failures' 
      }, { status: 500 });
    }

    if (!failures || failures.length === 0) {
      console.log(`No failures found for auction ${auctionId}`);
      return NextResponse.json({ 
        success: true, 
        message: 'No failures to process',
        processed: 0
      });
    }

    console.log(`Found ${failures.length} failures to process for auction ${auctionId}`);

    // Check wallet balances before processing
    const ethBalance = await provider.getBalance(adminWallet.address);
    if (ethBalance < ethers.parseEther("0.01")) {
      console.error('Insufficient ETH for batch processing');
      return NextResponse.json({ 
        success: false, 
        error: 'Insufficient ETH for gas' 
      }, { status: 500 });
    }

    // Set up contracts
    const qrTokenContract = new ethers.Contract(
      QR_TOKEN_ADDRESS,
      ERC20_ABI,
      adminWallet
    );

    const airdropContract = new ethers.Contract(
      RETRY_AIRDROP_CONTRACT_ADDRESS,
      AirdropABI.abi,
      adminWallet
    );

    // Check token balance
    const requiredTokens = BigInt(failures.length) * ethers.parseUnits('420', 18);
    const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
    
    if (tokenBalance < requiredTokens) {
      console.error(`Insufficient QR tokens. Need: ${ethers.formatUnits(requiredTokens, 18)}, Have: ${ethers.formatUnits(tokenBalance, 18)}`);
      return NextResponse.json({ 
        success: false, 
        error: 'Insufficient QR tokens for batch processing' 
      }, { status: 500 });
    }

    // Check and set allowance if needed
    const allowance = await qrTokenContract.allowance(adminWallet.address, RETRY_AIRDROP_CONTRACT_ADDRESS);
    if (allowance < requiredTokens) {
      console.log('Approving tokens for batch airdrop...');
      
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ? feeData.gasPrice * BigInt(120) / BigInt(100) : undefined;
      
      const approveTx = await qrTokenContract.approve(
        RETRY_AIRDROP_CONTRACT_ADDRESS,
        ethers.parseUnits('1000000', 18), // Approve large amount
        { gasPrice }
      );
      
      await approveTx.wait();
      console.log('Token approval confirmed');
    }

    // Filter out already successful claims
    const validFailures = [];
    for (const failure of failures) {
      // Check if there's already a successful claim for this user/auction
      const { data: existingClaim } = await supabase
        .from('link_visit_claims')
        .select('id')
        .eq('fid', failure.fid)
        .eq('auction_id', failure.auction_id)
        .eq('success', true)
        .maybeSingle();

      if (!existingClaim) {
        validFailures.push(failure);
      } else {
        console.log(`Skipping FID ${failure.fid} - already has successful claim`);
      }
    }

    console.log(`Processing ${validFailures.length} valid failures (${failures.length - validFailures.length} already claimed)`);

    // Check if all failures have already been successfully processed
    if (validFailures.length === 0) {
      console.log(`All ${failures.length} failures for auction ${auctionId} have already been successfully processed`);
      
      // Clean up the already processed failures from the failures table
      const failureIds = failures.map(f => f.id);
      await supabase
        .from('link_visit_claim_failures')
        .delete()
        .in('id', failureIds);
      
      console.log(`Cleaned up ${failures.length} already-processed failure records`);
      
      return NextResponse.json({ 
        success: true, 
        message: 'All failures already processed and cleaned up',
        totalFailures: failures.length,
        alreadyProcessed: failures.length,
        processed: 0,
        cleanedUp: failures.length
      });
    }

    // Process in batches
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (let i = 0; i < validFailures.length; i += BATCH_SIZE) {
      const batch = validFailures.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(validFailures.length/BATCH_SIZE)} (${batch.length} claims)`);

      // Prepare airdrop data for this batch
      const airdropContent = batch.map(failure => ({
        recipient: failure.eth_address,
        amount: ethers.parseUnits('420', 18)
      }));

      // Execute batch airdrop
      let txReceipt = null;
      let batchError = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            await delay(2000 * attempt);
          }

          const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
          const feeData = await provider.getFeeData();
          const baseGasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
          const gasPrice = baseGasPrice * BigInt(120 + attempt * 20) / BigInt(100);

          console.log(`Batch attempt ${attempt + 1} with gas price ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

          const tx = await airdropContract.airdropERC20(
            QR_TOKEN_ADDRESS,
            airdropContent,
            {
              nonce,
              gasPrice,
              gasLimit: 2000000 + (batch.length * 100000) // Dynamic gas based on batch size
            }
          );

          console.log(`Batch airdrop tx submitted: ${tx.hash}`);
          txReceipt = await tx.wait();
          break;

        } catch (err) {
          batchError = err;
          console.error(`Batch attempt ${attempt + 1} failed:`, err);
        }
      }

      if (txReceipt) {
        console.log(`Batch airdrop successful: ${txReceipt.hash}`);
        
        // Record successful claims for this batch
        const successfulClaims = batch.map(failure => ({
          fid: failure.fid,
          auction_id: parseInt(failure.auction_id),
          eth_address: failure.eth_address,
          link_visited_at: new Date().toISOString(),
          claimed_at: new Date().toISOString(),
          amount: 420,
          tx_hash: txReceipt.hash,
          success: true,
          username: failure.username || null,
          user_id: failure.user_id || null,
          winning_url: failure.winning_url || `https://qrcoin.fun/auction/${failure.auction_id}`,
          claim_source: failure.claim_source || 'mini_app',
          client_ip: 'batch_retry'
        }));

        // Insert successful claims
        const { error: insertError } = await supabase
          .from('link_visit_claims')
          .upsert(successfulClaims, {
            onConflict: 'fid,auction_id',
            ignoreDuplicates: false
          });

        if (insertError) {
          console.error('Error inserting batch claims:', insertError);
          results.errors.push(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: Failed to record claims - ${insertError.message}`);
        }

        // Remove processed failures
        const failureIds = batch.map(f => f.id);
        await supabase
          .from('link_visit_claim_failures')
          .delete()
          .in('id', failureIds);

        results.processed += batch.length;
        results.successful += batch.length;

      } else {
        console.error(`Batch ${Math.floor(i/BATCH_SIZE) + 1} failed permanently`);
        results.processed += batch.length;
        results.failed += batch.length;
        results.errors.push(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);

        // Update retry count for failed batch
        const failureIds = batch.map(f => f.id);
        await supabase
          .from('link_visit_claim_failures')
          .update({ 
            retry_count: 1,
            error_message: batchError instanceof Error ? batchError.message : 'Batch retry failed'
          })
          .in('id', failureIds);
      }

      // Add delay between batches to avoid overwhelming the network
      if (i + BATCH_SIZE < validFailures.length) {
        await delay(3000);
      }
    }

    console.log(`Batch retry completed for auction ${auctionId}:`, results);

    return NextResponse.json({
      success: true,
      auctionId,
      ...results
    });

  } catch (error) {
    console.error('Batch retry error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 