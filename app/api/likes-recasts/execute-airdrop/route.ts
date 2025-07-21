import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { queueFailedClaim } from '@/lib/queue/failedClaims';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';
import { getWalletPool } from '@/lib/wallet-pool';

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

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';
// const AIRDROP_CONTRACT_ADDRESS = process.env.AIRDROP_CONTRACT_ADDRESS3 || '';
// const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY3 || '';

// Alchemy RPC URL for Base
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

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

// Function to log errors to the database
async function logFailedTransaction(params: {
  fid: number | string;
  eth_address: string;
  username?: string | null;
  option_type: string;
  error_message: string;
  error_code?: string;
  signer_uuid?: string;
  tx_hash?: string;
  request_data?: Record<string, unknown>;
  gas_price?: string;
  gas_limit?: number;
  network_status?: string;
  retry_count?: number;
}) {
  try {
    // Insert the failure record and get its ID
    const { data, error } = await supabase
      .from('likes_recasts_claim_failures')
      .insert({
        fid: params.fid,
        eth_address: params.eth_address,
        username: params.username || null,
        option_type: params.option_type,
        error_message: params.error_message,
        error_code: params.error_code || null,
        signer_uuid: params.signer_uuid || null,
        tx_hash: params.tx_hash || null,
        request_data: params.request_data ? JSON.stringify(params.request_data) : null,
        gas_price: params.gas_price || null,
        gas_limit: params.gas_limit || null,
        network_status: params.network_status || null,
        retry_count: params.retry_count || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log error to database:', error);
      return;
    }
    
    // Queue for retry if eligible (skip duplicates and non-retryable errors)
    if (!['DUPLICATE_CLAIM', 'SIGNER_NOT_APPROVED'].includes(params.error_code || '')) {
      await queueFailedClaim({
        id: data.id,
        fid: params.fid as number,
        eth_address: params.eth_address,
        username: params.username as string | null,
        option_type: params.option_type,
        signer_uuid: params.signer_uuid,
      });
    }
  } catch (logError) {
    console.error('Error while logging to failure table:', logError);
  }
}

export async function POST(request: NextRequest) {
  // Get client IP for logging
  const clientIP = getClientIP(request);

  // Rate limiting FIRST: 5 requests per minute per IP (before any processing)
  if (isRateLimited(clientIP, 5, 60000)) {
    console.log(`🚫 RATE LIMITED: IP=${clientIP} (too many likes/recasts execute requests)`);
    return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
  }

  try {
    // Validate API key first
    const apiKey = request.headers.get('x-api-key');
    const validApiKey = process.env.LINK_CLICK_API_KEY;
    
    if (!apiKey || !validApiKey || apiKey !== validApiKey) {
      console.error(`🚨 UNAUTHORIZED ACCESS from IP: ${clientIP}`);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { fid, address, username, signer_uuid, amount, option_type } = await request.json();
    
    if (!fid || !address || !signer_uuid || !amount || !option_type) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    console.log(`🎯 EXECUTING AIRDROP: IP=${clientIP}, FID=${fid}, address=${address}, amount=${amount}, option=${option_type}`);
    
    // COMPREHENSIVE DUPLICATE CLAIM CHECKING
    // Check 1: Has this address already claimed ANY option type?
    const { data: claimDataByAddress, error: selectErrorByAddress } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('eth_address', address)
      .eq('success', true);
      
    if (selectErrorByAddress && selectErrorByAddress.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status by address:', selectErrorByAddress);
      
      // Log database error
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: 'Database error when checking claim status by address',
          error_code: selectErrorByAddress?.code || 'DB_SELECT_ERROR',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log database error:', logError);
      }
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this address has already claimed any option
    if (claimDataByAddress && claimDataByAddress.length > 0) {
      const existingClaim = claimDataByAddress[0];
      console.log(`Address ${address} has already claimed ${existingClaim.option_type} option at tx ${existingClaim.tx_hash} by FID ${existingClaim.fid}`);
      
      // Log duplicate claim attempt
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: `Address has already claimed ${existingClaim.option_type} option (previously claimed by FID ${existingClaim.fid})`,
          error_code: 'DUPLICATE_CLAIM_ADDRESS',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log duplicate claim attempt:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'This wallet address has already claimed likes/recasts rewards',
        tx_hash: existingClaim.tx_hash
      }, { status: 400 });
    }

    // Check 2: Has this FID already claimed ANY option type (with any address)?
    const { data: claimDataByFid, error: selectErrorByFid } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('fid', fid)
      .eq('success', true);
      
    if (selectErrorByFid && selectErrorByFid.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status by FID:', selectErrorByFid);
      
      // Log database error
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: 'Database error when checking claim status by FID',
          error_code: selectErrorByFid?.code || 'DB_SELECT_ERROR',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log database error:', logError);
      }
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this FID has already claimed any option with any address
    if (claimDataByFid && claimDataByFid.length > 0) {
      const existingClaim = claimDataByFid[0];
      console.log(`FID ${fid} has already claimed ${existingClaim.option_type} option at tx ${existingClaim.tx_hash} with address ${existingClaim.eth_address}`);
      
      // Log duplicate claim attempt
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: `FID has already claimed ${existingClaim.option_type} option with address ${existingClaim.eth_address}`,
          error_code: 'DUPLICATE_CLAIM_FID',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log duplicate claim attempt:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'This Farcaster account has already claimed likes/recasts rewards',
        tx_hash: existingClaim.tx_hash
      }, { status: 400 });
    }

    // Check 3: Specific option type check (for backward compatibility, though now redundant)
    const { data: existingSpecificClaim } = await supabase
      .from('likes_recasts_claims')
      .select('*')
      .eq('fid', fid)
      .eq('option_type', option_type)
      .eq('success', true)
      .single();
      
    if (existingSpecificClaim) {
      console.log(`User ${fid} has already claimed ${option_type} specifically`);
      
      // Log duplicate claim attempt
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: `User has already claimed ${option_type} option`,
          error_code: 'DUPLICATE_CLAIM_SPECIFIC',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log duplicate claim attempt:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: `User has already claimed ${option_type} option`,
        tx_hash: existingSpecificClaim.tx_hash
      }, { status: 400 });
    }
    
    // Verify signer is approved
    const { data: signerData } = await supabase
      .from('neynar_signers_updated')
      .select('*')
      .eq('signer_uuid', signer_uuid)
      .eq('status', 'approved')
      .single();
      
    if (!signerData) {
      // Log signer verification failure
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: 'Signer not found or not approved',
          error_code: 'SIGNER_NOT_APPROVED',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log signer verification failure:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Signer not found or not approved' 
      }, { status: 400 });
    }
    
    // Initialize ethers provider and get wallet from pool
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const walletPool = getWalletPool(provider);
    
    // Check if we should use direct wallet (pool disabled for this purpose)
    const directWallet = walletPool.getDirectWallet('likes-recasts');
    
    let adminWallet: ethers.Wallet;
    let DYNAMIC_AIRDROP_CONTRACT: string;
    let lockKey: string | null = null;
    let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
    
    if (directWallet) {
      // Use direct wallet without pool logic
      console.log(`Using direct wallet ${directWallet.wallet.address} (pool disabled for likes-recasts)`);
      adminWallet = directWallet.wallet;
      DYNAMIC_AIRDROP_CONTRACT = directWallet.airdropContract;
    } else {
      // Use wallet pool
      try {
        walletConfig = await walletPool.getAvailableWallet('likes-recasts');
        console.log(`Using wallet ${walletConfig.wallet.address} with contract ${walletConfig.airdropContract}`);
        adminWallet = walletConfig.wallet;
        DYNAMIC_AIRDROP_CONTRACT = walletConfig.airdropContract;
        lockKey = walletConfig.lockKey;
      } catch (poolError) {
        const errorMessage = 'All wallets are currently busy. Please try again in a moment.';
        console.error('Failed to get wallet from pool:', poolError);
        
        // Log wallet pool busy error
        try {
          await logFailedTransaction({
            fid: fid,
            eth_address: address,
            username: username || null,
            option_type: option_type,
            error_message: errorMessage,
            error_code: 'WALLET_POOL_BUSY',
            signer_uuid: signer_uuid,
            request_data: {
              fid,
              address,
              username,
              signer_uuid,
              amount,
              option_type
            },
            network_status: 'pool_busy',
            retry_count: 0,
          });
        } catch (logError) {
          console.error('Failed to log wallet pool error:', logError);
        }
        
        return NextResponse.json({ 
          success: false, 
          error: errorMessage
        }, { status: 503 });
      }
    }
    
    try {
      // Check wallet balance
      const balance = await provider.getBalance(adminWallet.address);
      console.log(`Wallet ${adminWallet.address} balance: ${ethers.formatEther(balance)} ETH`);
      
      if (balance < ethers.parseEther("0.001")) {
        console.error(`Wallet ${adminWallet.address} has insufficient ETH for gas`);
        
        // Log insufficient gas error
        try {
          await logFailedTransaction({
            fid: fid,
            eth_address: address,
            username: username || null,
            option_type: option_type,
            error_message: 'Admin wallet has insufficient ETH for gas',
            error_code: 'INSUFFICIENT_GAS',
            signer_uuid: signer_uuid,
            request_data: {
              fid,
              address,
              username,
              signer_uuid,
              amount,
              option_type
            },
            gas_price: ethers.formatEther(balance),
            network_status: 'low_funds',
            retry_count: 0,
          });
        } catch (logError) {
          console.error('Failed to log insufficient gas error:', logError);
        }
        
        return NextResponse.json({ 
          success: false, 
          error: 'Admin wallet has insufficient ETH for gas'
        }, { status: 500 });
      }
    
    // Define airdrop amount in wei
    const airdropAmountWei = ethers.parseUnits(amount.toString(), 18);
    
    console.log(`Preparing airdrop of ${amount} QR tokens to ${address}`);
    
      // Create contract instances using the dynamic contract from wallet pool
      const airdropContract = new ethers.Contract(
        DYNAMIC_AIRDROP_CONTRACT,
        AirdropABI.abi,
        adminWallet
      );
      
      const qrTokenContract = new ethers.Contract(
        QR_TOKEN_ADDRESS,
        ERC20_ABI,
        adminWallet
      );
    
    // Check token balance and allowance
    try {
      const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
      console.log(`Admin QR token balance: ${ethers.formatUnits(tokenBalance, 18)}`);
      
      if (tokenBalance < airdropAmountWei) {
        console.error("Admin wallet has insufficient QR tokens");
        
        // Log insufficient tokens error
        try {
          await logFailedTransaction({
            fid: fid,
            eth_address: address,
            username: username || null,
            option_type: option_type,
            error_message: 'Admin wallet has insufficient QR tokens',
            error_code: 'INSUFFICIENT_TOKENS',
            signer_uuid: signer_uuid,
            request_data: {
              fid,
              address,
              username,
              signer_uuid,
              amount,
              option_type
            },
            network_status: 'low_tokens',
            retry_count: 0,
          });
        } catch (logError) {
          console.error('Failed to log insufficient tokens error:', logError);
        }
        
        return NextResponse.json({ 
          success: false, 
          error: 'Admin wallet has insufficient QR tokens'
        }, { status: 500 });
      }
      
      const allowance = await qrTokenContract.allowance(adminWallet.address, DYNAMIC_AIRDROP_CONTRACT);
      console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
      
      if (allowance < airdropAmountWei) {
        console.log('Approving tokens for transfer...');
        const approveTx = await qrTokenContract.approve(
          DYNAMIC_AIRDROP_CONTRACT,
          ethers.parseUnits('1000000', 18) // Approve a large amount
        );
        
        console.log(`Approval tx submitted: ${approveTx.hash}`);
        
        // Add timeout wrapper to prevent Vercel timeout (55 seconds to be safe)
        const approvalPromise = approveTx.wait();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Approval transaction timeout after 55 seconds')), 55000)
        );
        
        try {
          await Promise.race([approvalPromise, timeoutPromise]);
          console.log('Approval confirmed');
        } catch (raceError) {
          if (raceError instanceof Error && raceError.message.includes('timeout')) {
            console.log('Approval timed out, will be queued for retry');
            // Don't throw - let the airdrop attempt proceed
          } else {
            throw raceError;
          }
        }
      }
    } catch (error) {
      console.error('Error checking token balance or approving:', error);
      
      // Log token check error
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: 'Failed to check token balance or approve tokens',
          error_code: 'TOKEN_CHECK_FAILED',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          network_status: 'token_check_failed',
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log token check error:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check token balance or approve tokens'
      }, { status: 500 });
    }
    
    // Prepare airdrop content
    const airdropContent = [{
      recipient: address,
      amount: airdropAmountWei
    }];
    
    console.log('Executing airdrop...');
    
    try {
      // Execute the airdrop
      const tx = await airdropContract.airdropERC20(
        QR_TOKEN_ADDRESS,
        airdropContent,
        {
          gasLimit: 500000
        }
      );
      
      console.log(`Airdrop tx submitted: ${tx.hash}`);
      
      // Add timeout wrapper to prevent Vercel timeout (55 seconds to be safe)
      const airdropPromise = tx.wait();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Airdrop transaction timeout after 55 seconds')), 55000)
      );
      
      const receipt = await Promise.race([airdropPromise, timeoutPromise]) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      console.log(`Airdrop confirmed in block ${receipt.blockNumber}`);
      
      // Record the claim in the database
      const { error: insertError } = await supabase
        .from('likes_recasts_claims')
        .insert({
          fid: fid,
          eth_address: address,
          option_type: option_type,
          amount: amount,
          tx_hash: receipt.hash,
          success: true,
          username: username || null,
          signer_uuid: signer_uuid,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        
      if (insertError) {
        console.error('Error recording claim:', insertError);
        return NextResponse.json({ 
          success: true, 
          warning: 'Airdrop successful but failed to record claim',
          tx_hash: receipt.hash
        });
      }
      
      return NextResponse.json({
        success: true, 
        message: 'Tokens claimed successfully',
        tx_hash: receipt.hash
      });
      
    } catch (error: unknown) {
      console.error('Airdrop transaction error:', error);
      
      let errorMessage = 'Failed to process airdrop';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      // Log the failure to the database
      try {
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          username: username || null,
          option_type: option_type,
          error_message: errorMessage,
          error_code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
          signer_uuid: signer_uuid,
          request_data: {
            fid,
            address,
            username,
            signer_uuid,
            amount,
            option_type
          },
          retry_count: 0,
        });
      } catch (logError) {
        console.error('Failed to log airdrop failure:', logError);
      }
      
      return NextResponse.json({ 
        success: false, 
        error: errorMessage
      }, { status: 500 });
    }
    } finally {
      // Release the wallet lock if using pool
      if (lockKey && walletConfig) {
        await walletPool.releaseWallet(lockKey);
        console.log(`Released wallet lock for ${adminWallet.address}`);
      }
    }
    
  } catch (error: unknown) {
    console.error('Execute airdrop error:', error);
    
    let errorMessage = 'Failed to process airdrop';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 