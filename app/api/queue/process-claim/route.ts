/* eslint-disable */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { updateRetryStatus, redis } from '@/lib/queue/failedClaims';
import { Receiver } from '@upstash/qstash';

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

// Use different contracts based on claim source
const getContractAddresses = (claimSource: string = 'mini_app') => {
  if (claimSource === 'web') {
    // Web context: use contract 4
    return {
      AIRDROP_CONTRACT_ADDRESS: process.env.AIRDROP_CONTRACT_ADDRESS4 || '',
      ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY4 || ''
    };
  } else {
    // Mini-app context: use contract 2 (existing)
    return {
      AIRDROP_CONTRACT_ADDRESS: process.env.AIRDROP_CONTRACT_ADDRESS2 || '',
      ADMIN_PRIVATE_KEY: process.env.ADMIN_PRIVATE_KEY2 || ''
    };
  }
};

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
    const contractAddresses = getContractAddresses(claimSource);
    
    console.log(`Processing queued claim with source: ${claimSource}, using contract: ${contractAddresses.AIRDROP_CONTRACT_ADDRESS}`);
    
    // Set up lock to prevent concurrent transactions
    const adminWalletAddress = new ethers.Wallet(contractAddresses.ADMIN_PRIVATE_KEY).address.toLowerCase();
    const lockKey = `admin-wallet-lock:${adminWalletAddress}`;
    
    // Try to get a lock
    const gotLock = await redis.set(lockKey, 'locked', {
      nx: true,
      ex: 30 // Lock expires in 30 seconds - much shorter for faster throughput
    });
    
    if (!gotLock) {
      console.log('Another process is already using the admin wallet, will retry later');
      
      // Calculate a delay between 5-15 seconds for faster retry
      const delaySeconds = 5 + Math.floor(Math.random() * 10);
      
      return NextResponse.json({
        success: false, 
        status: 'retry_scheduled',
        error: 'Wallet busy with another transaction',
        retryAfter: delaySeconds
      });
    }
    
    try {
      // Update status to processing
      await updateRetryStatus(failureId, {
        status: 'processing',
        processingStarted: new Date().toISOString(),
        currentAttempt: attempt
      });
      
      // Check if it's already been handled successfully
      const { data: existingClaim } = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('fid', failure.fid)
        .eq('auction_id', failure.auction_id)
        .eq('success', true)
        .maybeSingle();
      
      if (existingClaim) {
        console.log(`User already has successful claim for auction ${failure.auction_id}`);
        
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'already_claimed',
          completedAt: new Date().toISOString()
        });
        
        // Delete the failure record
        await supabase
          .from('link_visit_claim_failures')
          .delete()
          .eq('id', failureId);
        
        return NextResponse.json({ 
          success: true, 
          status: 'already_claimed'
        });
      }
      
      // Initialize provider and wallet
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const adminWallet = new ethers.Wallet(contractAddresses.ADMIN_PRIVATE_KEY, provider);
      
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
        contractAddresses.AIRDROP_CONTRACT_ADDRESS,
        AirdropABI.abi,
        adminWallet
      );
      
      // Check token balance
      const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
      if (tokenBalance < ethers.parseUnits('1000', 18)) {
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'failed',
          error: 'Insufficient QR tokens',
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Insufficient QR tokens' 
        });
      }
      
      // Check allowance
      const allowance = await qrTokenContract.allowance(adminWallet.address, contractAddresses.AIRDROP_CONTRACT_ADDRESS);
      if (allowance < ethers.parseUnits('1000', 18)) {
        console.log('Approving tokens for airdrop contract...');
        
        // Increase gas price by 30%
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? feeData.gasPrice * BigInt(130) / BigInt(100) : undefined;
        
        // Approve a large amount
        const approveTx = await qrTokenContract.approve(
          contractAddresses.AIRDROP_CONTRACT_ADDRESS,
          ethers.parseUnits('1000000', 18),
          { gasPrice }
        );
        
        await approveTx.wait();
        console.log('Token approval confirmed');
      }
      
      // Prepare airdrop data
      const airdropAmount = ethers.parseUnits('1000', 18);
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
      
      // Record in link_visit_claims table
      const { error: insertError } = await supabase
        .from('link_visit_claims')
        .insert({
          fid: failure.fid,
          auction_id: failure.auction_id,
          eth_address: failure.eth_address,
          link_visited_at: new Date().toISOString(),
          claimed_at: new Date().toISOString(),
          amount: 1000,
          tx_hash: txReceipt.hash,
          success: true,
          username: failure.username || null,
          winning_url: failure.winning_url || `https://qrcoin.fun/auction/${failure.auction_id}`
        });
      
      if (insertError) {
        console.error('Error inserting success record:', insertError);
        
        // Try update if insert fails
        const { error: updateError } = await supabase
          .from('link_visit_claims')
          .update({
            eth_address: failure.eth_address,
            claimed_at: new Date().toISOString(),
            amount: 2000,
            tx_hash: txReceipt.hash,
            success: true
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
      // Always release the lock when done
      await redis.del(lockKey);
      console.log(`Released lock: ${lockKey}`);
    }
  } catch (error) {
    console.error('Error processing retried claim:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 