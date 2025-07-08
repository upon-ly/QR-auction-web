/* eslint-disable */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { updateRetryStatus, redis } from '@/lib/queue/failedClaims';
import { Receiver } from '@upstash/qstash';
import { getWalletPool } from '@/lib/wallet-pool';
import { getClaimAmountForAddress } from '@/lib/wallet-balance-checker';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database writes may fail due to RLS');
}

// QStash receiver for verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

// Contract details - function to get addresses based on claim source
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';

// Contract addresses are now managed by wallet pool

// Alchemy RPC URL
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ERC20 ABI for approval
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

export async function POST(req: NextRequest) {
  let queueLockKey: string | undefined;
  
  // Verify the request is from QStash
  try {
    const signature = req.headers.get('upstash-signature');
    if (!signature) {
      return NextResponse.json({ success: false, error: 'Unauthorized - missing signature' }, { status: 401 });
    }
    
    const bodyText = await req.text();
    const isValid = await receiver.verify({
      signature,
      body: bodyText,
    });
    
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Unauthorized - invalid signature' }, { status: 401 });
    }
    
    // Parse the body as JSON
    const body = JSON.parse(bodyText);
    const { failureId, attempt } = body;
    
    console.log(`Processing queued claim: ${failureId}, attempt: ${attempt}`);
    
    // Acquire queue processing lock to prevent duplicate processing of same failure
    queueLockKey = `queue-failure-lock:${failureId}`;
    
    const queueLockAcquired = await redis.set(queueLockKey, Date.now().toString(), {
      nx: true, // Only set if not exists
      ex: 300   // Expire in 5 minutes (longer than normal processing time)
    });
    
    if (!queueLockAcquired) {
      console.log(`🔒 QUEUE DUPLICATE BLOCKED: Failure ${failureId} already being processed`);
      return NextResponse.json({ 
        success: false, 
        error: 'This failure is already being processed by another worker.',
        code: 'QUEUE_PROCESSING_IN_PROGRESS'
      }, { status: 429 });
    }
    
    console.log(`🔓 ACQUIRED QUEUE LOCK: Failure ${failureId}`);
    
    // Get the failure details from the database
    const { data: failure, error: fetchError } = await supabase
      .from('link_visit_claim_failures')
      .select('*')
      .eq('id', failureId)
      .single();
    
    if (fetchError || !failure) {
      console.error('Failed to fetch failure record:', fetchError);
      return NextResponse.json({ success: false, error: 'Failure record not found' });
    }
    
    // Get claim source from the failure record to determine which contracts to use
    const claimSource = failure.claim_source || 'mini_app';
    
    console.log(`Processing queued claim with source: ${claimSource}`);
    
    // CHECK BANNED USERS before processing
    const banCheckConditions = [];
    
    if (failure.fid && failure.fid > 0) {
      banCheckConditions.push(`fid.eq.${failure.fid}`);
    }
    
    if (failure.eth_address) {
      banCheckConditions.push(`eth_address.ilike.${failure.eth_address}`);
    }
    
    if (failure.username) {
      banCheckConditions.push(`username.ilike.${failure.username}`);
    }
    
    if (banCheckConditions.length > 0) {
      const { data: bannedUser } = await supabase
        .from('banned_users')
        .select('fid, username, reason')
        .or(banCheckConditions.join(','))
        .single();
      
      if (bannedUser) {
        console.log(`🚫 QUEUE: BANNED USER BLOCKED: FID=${failure.fid}, username=${failure.username}, reason=${bannedUser.reason}`);
        
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'banned_user',
          completedAt: new Date().toISOString()
        });
        
        // Delete from failures table
        await supabase
          .from('link_visit_claim_failures')
          .delete()
          .eq('id', failureId);
        
        return NextResponse.json({ 
          success: false, 
          status: 'banned_user',
          error: 'User is banned'
        });
      }
    }
    
    // PRIORITY: Early duplicate check - see if this has been claimed since the failure was queued
    console.log(`🔍 QUEUE EARLY DUPLICATE CHECK: Checking if already claimed for auction ${failure.auction_id}`);
    
    // Check by address first (applies to both web and mini-app)
    const { data: existingClaimByAddress, error: addressCheckError } = await supabase
      .from('link_visit_claims')
      .select('tx_hash, claimed_at, claim_source')
      .eq('eth_address', failure.eth_address)
      .eq('auction_id', failure.auction_id)
      .not('claimed_at', 'is', null);
    
    if (addressCheckError) {
      console.error('Error in queue early address duplicate check:', addressCheckError);
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      });
    }
    
    if (existingClaimByAddress && existingClaimByAddress.length > 0) {
      const existing = existingClaimByAddress[0];
      console.log(`🚫 QUEUE EARLY DUPLICATE BY ADDRESS: ${failure.eth_address} already claimed for auction ${failure.auction_id} at tx ${existing.tx_hash} (source: ${existing.claim_source})`);
      
      // Update retry status and clean up
      await updateRetryStatus(failureId, {
        status: 'already_claimed_by_address',
        completedAt: new Date().toISOString()
      });
      
      // Delete the failure record
      await supabase
        .from('link_visit_claim_failures')
        .delete()
        .eq('id', failureId);
      
      return NextResponse.json({ 
        success: true, 
        status: 'already_claimed_by_address',
        tx_hash: existing.tx_hash
      });
    }
    
    // For mini-app claims, also check by FID
    if (claimSource !== 'web' && failure.fid && failure.fid > 0) {
      const { data: existingClaimByFid, error: fidCheckError } = await supabase
        .from('link_visit_claims')
        .select('tx_hash, claimed_at, claim_source')
        .eq('fid', failure.fid)
        .eq('auction_id', failure.auction_id)
        .not('claimed_at', 'is', null);
      
      if (fidCheckError) {
        console.error('Error in queue early FID duplicate check:', fidCheckError);
        return NextResponse.json({
          success: false,
          error: 'Database error when checking FID claim status'
        });
      }
      
      if (existingClaimByFid && existingClaimByFid.length > 0) {
        const existing = existingClaimByFid[0];
        console.log(`🚫 QUEUE EARLY DUPLICATE BY FID: FID ${failure.fid} already claimed for auction ${failure.auction_id} at tx ${existing.tx_hash} (source: ${existing.claim_source})`);
        
        // Update retry status and clean up
        await updateRetryStatus(failureId, {
          status: 'already_claimed_by_fid',
          completedAt: new Date().toISOString()
        });
        
        // Delete the failure record
        await supabase
          .from('link_visit_claim_failures')
          .delete()
          .eq('id', failureId);
        
        return NextResponse.json({ 
          success: true, 
          status: 'already_claimed_by_fid',
          tx_hash: existing.tx_hash
        });
      }
    }
    
    // Check by user ID/username if available
    if (failure.user_id || failure.username) {
      const checkField = failure.user_id ? 'user_id' : 'username';
      const checkValue = failure.user_id || failure.username;
      
      const { data: existingClaimByUser, error: userCheckError } = await supabase
        .from('link_visit_claims')
        .select('tx_hash, claimed_at, claim_source')
        .eq(checkField, checkValue)
        .eq('auction_id', failure.auction_id)
        .not('claimed_at', 'is', null);
      
      if (userCheckError) {
        console.error(`Error in queue early ${checkField} duplicate check:`, userCheckError);
        return NextResponse.json({
          success: false,
          error: `Database error when checking ${checkField} claim status`
        });
      }
      
      if (existingClaimByUser && existingClaimByUser.length > 0) {
        const existing = existingClaimByUser[0];
        const userIdentifier = failure.user_id ? `User ID ${failure.user_id}` : `Username ${failure.username}`;
        console.log(`🚫 QUEUE EARLY DUPLICATE BY ${checkField.toUpperCase()}: ${userIdentifier} already claimed for auction ${failure.auction_id} at tx ${existing.tx_hash} (source: ${existing.claim_source})`);
        
        // Update retry status and clean up
        await updateRetryStatus(failureId, {
          status: `already_claimed_by_${checkField}`,
          completedAt: new Date().toISOString()
        });
        
        // Delete the failure record
        await supabase
          .from('link_visit_claim_failures')
          .delete()
          .eq('id', failureId);
        
        return NextResponse.json({ 
          success: true, 
          status: `already_claimed_by_${checkField}`,
          tx_hash: existing.tx_hash
        });
      }
    }
    
    console.log(`✅ QUEUE EARLY DUPLICATE CHECK PASSED: No existing claims found for auction ${failure.auction_id}`);
    
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const walletPool = getWalletPool(provider);
    
    // Determine the purpose based on claim source
    let walletPurpose: 'link-web' | 'mobile-link-visit' | 'link-miniapp';
    if (claimSource === 'mobile') {
      walletPurpose = 'mobile-link-visit';
    } else if (claimSource === 'web') {
      walletPurpose = 'link-web';
    } else {
      walletPurpose = 'link-miniapp';
    }
    
    // Check if we should use direct wallet (pool disabled for this purpose)
    const directWallet = walletPool.getDirectWallet(walletPurpose);
    
    let adminWallet: ethers.Wallet;
    let DYNAMIC_AIRDROP_CONTRACT: string;
    let lockKey: string | null = null;
    let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
    
    if (directWallet) {
      // Use direct wallet without pool logic
      console.log(`Using direct wallet ${directWallet.wallet.address} (pool disabled for ${walletPurpose})`);
      adminWallet = directWallet.wallet;
      DYNAMIC_AIRDROP_CONTRACT = directWallet.airdropContract;
    } else {
      // Use wallet pool
      try {
        walletConfig = await walletPool.getAvailableWallet(walletPurpose);
        console.log(`Using wallet ${walletConfig.wallet.address} with contract ${walletConfig.airdropContract} for ${claimSource}`);
        adminWallet = walletConfig.wallet;
        DYNAMIC_AIRDROP_CONTRACT = walletConfig.airdropContract;
        lockKey = walletConfig.lockKey;
      } catch (poolError) {
        console.log('All wallets are currently busy, will retry later');
        
        // Calculate a delay between 5-15 seconds for faster retry
        const delaySeconds = 5 + Math.floor(Math.random() * 10);
        
        return NextResponse.json({
          success: false, 
          status: 'retry_scheduled',
          error: 'All wallets busy',
          retryAfter: delaySeconds
        });
      }
    }
    
    try {
      // Update status to processing
      await updateRetryStatus(failureId, {
        status: 'processing',
        processingStarted: new Date().toISOString(),
        currentAttempt: attempt
      });

      // Helper function to get database default
      const getDefaultAmount = async (category: string, fallback: number): Promise<number> => {
        try {
          const { data } = await supabase
            .from('claim_amount_configs')
            .select('amount')
            .eq('category', category)
            .eq('is_active', true)
            .single();
          return data?.amount || fallback;
        } catch {
          return fallback;
        }
      };
      
      // Determine claim amount based on claim source FIRST (before any token checks)
      let claimAmount: string;
      let neynarScore: number | undefined;
      let spamLabel: boolean | null = null;
      
      // Determine claim amount based on claim source (same logic as main claim route)
      if (claimSource === 'web' || claimSource === 'mobile') {
        // Web/mobile users: wallet holdings only (no Neynar scores)
        try {
          const claimResult = await getClaimAmountForAddress(
            failure.eth_address,
            claimSource,
            ALCHEMY_API_KEY,
            undefined // No FID for web users - they don't get Neynar scores
          );
          claimAmount = claimResult.amount.toString();
          neynarScore = undefined; // Web users don't get Neynar scores
          console.log(`💰 QUEUE: Dynamic claim amount for ${claimSource} user ${failure.eth_address}: ${claimAmount} QR`);
        } catch (error) {
          console.error('QUEUE: Error checking claim amount, using default:', error);
          claimAmount = '500'; // Fallback to web default
        }
              } else {
          // Mini-app users: use unified function that checks Neynar score
          try {
            const claimResult = await getClaimAmountForAddress(
              failure.eth_address || '',
              claimSource || 'mini_app',
              ALCHEMY_API_KEY,
              failure.fid
            );
            claimAmount = claimResult.amount.toString();
            neynarScore = claimResult.neynarScore;
            
            // Handle spam label for mini-app users with FIDs
            if (failure.fid && failure.fid > 0) {
              if (claimResult.hasSpamLabelOverride) {
                // hasSpamLabelOverride means they have label_value = 2 (not spam)
                spamLabel = false;
                console.log(`📊 QUEUE: FID ${failure.fid} has spam override (label_value 2) → spam_label: false`);
              } else {
                // No override, check if they have any spam label
                try {
                  const { data: spamLabelData, error: spamLabelError } = await supabase
                    .from('spam_labels')
                    .select('label_value')
                    .eq('fid', failure.fid)
                    .maybeSingle();
                  
                  if (!spamLabelError && spamLabelData) {
                    // Convert label_value to boolean: 0 = true (spam), 2 = false (not spam)
                    spamLabel = spamLabelData.label_value === 0;
                    console.log(`📊 QUEUE: FID ${failure.fid} has label_value ${spamLabelData.label_value} → spam_label: ${spamLabel}`);
                  } else {
                    console.log(`📊 QUEUE: FID ${failure.fid} has no spam label data`);
                  }
                } catch (error) {
                  console.error('QUEUE: Error checking spam labels:', error);
                }
              }
            }
            
            console.log(`💰 QUEUE: Mini-app claim amount for FID ${failure.fid}: ${claimAmount} QR, Neynar score: ${neynarScore}, spam_label: ${spamLabel}`);
        } catch (error) {
          console.error('QUEUE: Error determining mini-app claim amount:', error);
          claimAmount = '100'; // Fallback to mini-app default
        }
      }
      
      // Check wallet balances
      const ethBalance = await provider.getBalance(adminWallet.address);
      if (ethBalance < ethers.parseEther("0.001")) {
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'failed',
          error: 'Insufficient ETH for gas',
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Insufficient ETH for gas' 
        });
      }
      
      // Set up contracts
      const qrTokenContract = new ethers.Contract(
        QR_TOKEN_ADDRESS,
        ERC20_ABI,
        adminWallet
      );
      
      const airdropContract = new ethers.Contract(
        DYNAMIC_AIRDROP_CONTRACT,
        AirdropABI.abi,
        adminWallet
      );
      
      // Check token balance
      const requiredTokenAmount = ethers.parseUnits(claimAmount, 18);
      const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
      if (tokenBalance < requiredTokenAmount) {
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'failed',
          error: `Insufficient QR tokens (need ${claimAmount}, have ${ethers.formatUnits(tokenBalance, 18)})`,
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          success: false, 
          error: `Insufficient QR tokens (need ${claimAmount})` 
        });
      }
      
      // Check allowance
      const allowance = await qrTokenContract.allowance(adminWallet.address, DYNAMIC_AIRDROP_CONTRACT);
      if (allowance < requiredTokenAmount) {
        console.log('Approving tokens for airdrop contract...');
        
        // Increase gas price by 30%
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? feeData.gasPrice * BigInt(130) / BigInt(100) : undefined;
        
        // Approve a large amount
        const approveTx = await qrTokenContract.approve(
          DYNAMIC_AIRDROP_CONTRACT,
          ethers.parseUnits('1000000', 18),
          { gasPrice }
        );
        
        await approveTx.wait();
        console.log('Token approval confirmed');
      }
      
      // Prepare airdrop data
      const airdropAmount = ethers.parseUnits(claimAmount, 18);
      const airdropContent = [{
        recipient: failure.eth_address,
        amount: airdropAmount
      }];
      
      // Try to execute the transaction with dynamic gas
      let txReceipt = null;
      let lastError = null;
      
      for (let txAttempt = 0; txAttempt < 3; txAttempt++) {
        try {
          // Add delay between transaction attempts - reduced for faster processing
          if (txAttempt > 0) {
            await delay(1000 * txAttempt);
          }
          
          // Get fresh nonce
          const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
          
          // Increase gas based on attempt
          const feeData = await provider.getFeeData();
          const baseGasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
          const gasPrice = baseGasPrice * BigInt(130 + txAttempt * 30) / BigInt(100);
          
          console.log(`Transaction attempt ${txAttempt + 1} with gas price ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
          
          // Execute airdrop
          const tx = await airdropContract.airdropERC20(
            QR_TOKEN_ADDRESS,
            airdropContent,
            {
              nonce,
              gasPrice,
              gasLimit: 5000000
            }
          );
          
          console.log(`Airdrop tx submitted: ${tx.hash}`);
          txReceipt = await tx.wait();
          break; // Success - exit the retry loop
          
        } catch (err) {
          lastError = err;
          console.error(`Transaction attempt ${txAttempt + 1} failed:`, err);
        }
      }
      
      // If all transaction attempts failed
      if (!txReceipt) {
        console.error('All transaction attempts failed');
        
        // Should we requeue for later retry?
        if (attempt < 4) { // Cap at 5 total attempts (0-4)
          // Calculate delay for next attempt with faster schedule
          // New schedule: 2min, 5min, 10min, 20min
          let delayMinutes = 2;
          if (attempt === 1) delayMinutes = 5;
          if (attempt === 2) delayMinutes = 10;
          if (attempt === 3) delayMinutes = 20;
          
          // Update retry status
          await updateRetryStatus(failureId, {
            status: 'retry_scheduled',
            lastError: lastError instanceof Error ? lastError.message : String(lastError),
            nextRetryAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
          });
          
          // Queue next retry with QStash
          const response = await fetch('https://qstash.upstash.io/v2/publish', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`
            },
            body: JSON.stringify({
              url: `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-claim`,
              body: {
                failureId,
                attempt: attempt + 1
              },
              delay: delayMinutes * 60 // Convert to seconds
            })
          });
          
          if (!response.ok) {
            console.error('Failed to schedule retry:', await response.text());
          } else {
            console.log(`Scheduled retry ${attempt + 1} in ${delayMinutes} minutes`);
          }
          
          return NextResponse.json({
            success: false,
            status: 'retry_scheduled',
            nextRetry: delayMinutes,
            attempt: attempt + 1
          });
        }
        
        // Max retries exceeded - mark as permanently failed
        await updateRetryStatus(failureId, {
          status: 'max_retries_exceeded',
          lastError: lastError instanceof Error ? lastError.message : String(lastError),
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: false,
          status: 'max_retries_exceeded',
          error: lastError instanceof Error ? lastError.message : 'Max retries exceeded'
        });
      }
      
      // Transaction succeeded - record claim
      console.log(`Airdrop successful with TX: ${txReceipt.hash}`);
      
      // Determine proper claim source based on available data
      // Always validate claim source based on FID - negative FIDs are web users
      let determinedClaimSource: string;
      if (failure.fid && failure.fid > 0) {
        determinedClaimSource = 'mini_app';
      } else {
        determinedClaimSource = 'web';
      }
      
      console.log(`📝 CLAIM SOURCE DETERMINATION: original=${failure.claim_source}, fid=${failure.fid}, determined=${determinedClaimSource} (corrected based on FID)`);
      
      // Record in link_visit_claims table
      const { error: insertError } = await supabase
        .from('link_visit_claims')
        .insert({
          fid: failure.fid,
          auction_id: failure.auction_id,
          eth_address: failure.eth_address,
          link_visited_at: new Date().toISOString(),
          claimed_at: new Date().toISOString(),
          amount: parseInt(claimAmount),
          tx_hash: txReceipt.hash,
          success: true,
          username: failure.username || null,
          user_id: failure.user_id || null,
          winning_url: failure.winning_url || `https://qrcoin.fun/auction/${failure.auction_id}`,
          claim_source: determinedClaimSource,
          client_ip: failure.client_ip || 'queue_retry', // Track original IP or mark as retry
          neynar_user_score: neynarScore !== undefined ? neynarScore : null,
          spam_label: spamLabel // Store the spam label
        });
      
      if (insertError) {
        console.error('Error inserting success record:', insertError);
        
        // Check if it's a duplicate key error
        if (insertError.code === '23505' || insertError.message.includes('duplicate key')) {
          // CRITICAL: This means another transaction already claimed!
          console.log(`⚠️ QUEUE DUPLICATE CLAIM: Transaction ${txReceipt.hash} succeeded but claim already exists`);
          
          // AUTO-BAN: This user managed to get multiple blockchain transactions through!
          try {
            // Get the existing claim to find the other transaction
            const { data: existingClaim } = await supabase
              .from('link_visit_claims')
              .select('tx_hash')
              .eq('fid', failure.fid)
              .eq('auction_id', failure.auction_id)
              .single();
            
            if (existingClaim) {
              console.log(`🚨 QUEUE AUTO-BAN: FID ${failure.fid} exploited race condition`);
              console.log(`🚨 Transactions: ${existingClaim.tx_hash} and ${txReceipt.hash}`);
              
              const duplicateTxs = [existingClaim.tx_hash, txReceipt.hash];
              
              // Ban this user
              await supabase
                .from('banned_users')
                .insert({
                  fid: failure.fid,
                  username: failure.username,
                  eth_address: failure.eth_address,
                  reason: `Auto-banned: Exploited race condition via retry queue - got ${duplicateTxs.length} blockchain transactions for auction ${failure.auction_id}`,
                  created_at: new Date().toISOString(),
                  banned_by: 'queue_race_detector',
                  auto_banned: true,
                  total_claims_attempted: duplicateTxs.length, // Only count the duplicate transactions for THIS auction
                  duplicate_transactions: duplicateTxs,
                  total_tokens_received: duplicateTxs.length * parseInt(claimAmount),
                  ban_metadata: {
                    trigger: 'queue_duplicate_tx',
                    auction_id: failure.auction_id,
                    recorded_tx: existingClaim.tx_hash,
                    duplicate_tx: txReceipt.hash,
                    source: 'retry_queue',
                    exploited_auction: failure.auction_id,
                    duplicate_count: duplicateTxs.length,
                    note: `User successfully executed ${duplicateTxs.length} blockchain transactions for auction ${failure.auction_id} via retry queue`
                  }
                });
            }
          } catch (banError) {
            console.error('Error auto-banning from queue:', banError);
          }
          
          // Still mark as success since blockchain transaction went through
          await updateRetryStatus(failureId, {
            status: 'success_duplicate',
            tx_hash: txReceipt.hash,
            completedAt: new Date().toISOString()
          });
          
          // Delete from failures table
          await supabase
            .from('link_visit_claim_failures')
            .delete()
            .eq('id', failureId);
          
          return NextResponse.json({
            success: true,
            status: 'success_duplicate',
            tx_hash: txReceipt.hash,
            warning: 'Transaction successful but claim was already recorded'
          });
        }
        
        // Try update if insert fails for other reasons
        const { error: updateError } = await supabase
          .from('link_visit_claims')
          .update({
            eth_address: failure.eth_address,
            claimed_at: new Date().toISOString(),
            amount: parseInt(claimAmount),
            tx_hash: txReceipt.hash,
            success: true,
            username: failure.username || null,
            user_id: failure.user_id || null,
            claim_source: determinedClaimSource,
            client_ip: failure.client_ip || 'queue_retry', // Track original IP or mark as retry
            neynar_user_score: neynarScore !== undefined ? neynarScore : null,
            spam_label: spamLabel // Store the spam label
          })
          .match({
            fid: failure.fid,
            auction_id: failure.auction_id
          });
        
        if (updateError) {
          console.error('Error updating record:', updateError);
          // Continue anyway - the transaction succeeded
        }
      }
      
      // Update retry status
      await updateRetryStatus(failureId, {
        status: 'success',
        tx_hash: txReceipt.hash,
        completedAt: new Date().toISOString()
      });
      
      // Delete from failures table
      await supabase
        .from('link_visit_claim_failures')
        .delete()
        .eq('id', failureId);
      
      return NextResponse.json({
        success: true,
        status: 'success',
        tx_hash: txReceipt.hash
      });
      
    } catch (error) {
      console.error('Error processing retried claim:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      // Release the wallet lock if using pool
      if (lockKey && walletConfig) {
        await walletPool.releaseWallet(lockKey);
        console.log(`Released wallet lock for ${adminWallet.address}`);
      }
    }
  } catch (error) {
    console.error('Error processing retried claim:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    // Always release the queue lock if it was acquired
    if (queueLockKey) {
      try {
        await redis.del(queueLockKey);
        console.log(`🔓 RELEASED QUEUE LOCK: ${queueLockKey}`);
      } catch (lockError) {
        console.error('Error releasing queue lock:', lockError);
      }
    }
  }
} 