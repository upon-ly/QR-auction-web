import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { validateMiniAppUser } from '@/utils/miniapp-validation';
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

// Import queue functionality
import { queueFailedClaim } from '@/lib/queue/failedClaims';

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';

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

// Define request data interface
interface AirdropRequestData {
  fid: number;
  address: string;
  hasNotifications?: boolean;
  username?: string;
  [key: string]: unknown; // Allow other properties
}

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to log errors to the database
async function logFailedTransaction(params: {
  fid: number | string;
  eth_address: string;
  username?: string;
  error_message: string;
  error_code?: string;
  tx_hash?: string;
  request_data?: Record<string, unknown>;
  gas_price?: string;
  gas_limit?: number;
  network_status?: string;
  retry_count?: number;
  client_ip?: string;
}) {
  try {
    // Extract client IP from request_data if not provided directly
    const clientIP = params.client_ip || 
      (params.request_data?.clientIP as string) || 
      'unknown';

    // Insert the failure record and get its ID
    const { data, error } = await supabase
      .from('airdrop_claim_failures')
      .insert({
        fid: params.fid,
        eth_address: params.eth_address,
        username: params.username,
        error_message: params.error_message,
        error_code: params.error_code || null,
        tx_hash: params.tx_hash || null,
        request_data: params.request_data ? JSON.stringify(params.request_data) : null,
        gas_price: params.gas_price || null,
        gas_limit: params.gas_limit || null,
        network_status: params.network_status || null,
        retry_count: params.retry_count || 0,
        client_ip: clientIP
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log error to database:', error);
      return;
    }
    
    // Now also queue for retry (if eligible for retry)
    if (!['DUPLICATE_CLAIM', 'DUPLICATE_CLAIM_FID', 'DUPLICATE_CLAIM_ADDRESS', 'DUPLICATE_CLAIM_DB_CONSTRAINT', 'NOTIFICATIONS_DISABLED', 'INVALID_USER', 'VALIDATION_ERROR'].includes(params.error_code || '')) {
      await queueFailedClaim({
        id: data.id,
        fid: params.fid as number,
        eth_address: params.eth_address,
        auction_id: '0', // Use '0' for airdrop since it's not auction-based
        username: params.username as string,
        winning_url: null,
      });
    }
  } catch (logError) {
    console.error('Error while logging to failure table:', logError);
  }
}

// Function to retry transactions with exponential backoff
async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let attempt = 0;
  let lastError: Error | unknown;

  while (attempt <= maxRetries) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      
      // Check if this is a retryable error
      const isRetryable = error instanceof Error && (
        error.message?.includes('replacement fee too low') ||
        error.message?.includes('nonce has already been used') ||
        error.message?.includes('transaction underpriced') ||
        error.message?.includes('timeout') ||
        error.message?.includes('network error') ||
        error.message?.includes('transaction execution reverted')
      );
      
      // Don't retry if error is not retryable
      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }
      
      // Log retry attempt
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Transaction failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${initialDelayMs * 2 ** attempt}ms. Error: ${errorMessage}`);
      
      // Wait with exponential backoff
      await delay(initialDelayMs * 2 ** attempt);
      attempt++;
    }
  }
  
  throw lastError;
}

export async function POST(request: NextRequest) {
  let requestData: Partial<AirdropRequestData> = {};
  let fid: number | undefined;
  let address: string | undefined;
  let username: string | undefined;
  let hasNotifications: boolean | undefined;

  // Get client IP for logging
  const clientIP = getClientIP(request);

  // Rate limiting FIRST: 5 requests per minute per IP (before any processing)
  if (isRateLimited(clientIP, 5, 60000)) {
    console.log(`🚫 RATE LIMITED: IP=${clientIP} (too many airdrop requests)`);
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
    
    // Parse request body early for rate limiting
    requestData = await request.json() as AirdropRequestData;
    ({ fid, address, hasNotifications, username } = requestData);
    
    if (!fid || !address || !username || username.trim() === '') {
      console.log(`🚫 VALIDATION ERROR: IP=${clientIP}, Missing fid, address, or username (or username is empty). Received: fid=${fid}, address=${address}, username=${username}`);
      
      // Log validation error to database FIRST
      await logFailedTransaction({
        fid: fid || 0,
        eth_address: address || 'unknown',
        username: username || undefined,
        error_message: 'Missing fid, address, or username (or username is empty)',
        error_code: 'VALIDATION_ERROR',
        request_data: { ...requestData, clientIP } as Record<string, unknown>
      });
      
      // Then trigger auto-block check for this IP
      fetch(`${process.env.NEXT_PUBLIC_HOST_URL}/api/admin/auto-block-ip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ADMIN_API_KEY || '',
        },
        body: JSON.stringify({ 
          ip: clientIP, 
          reason: 'Missing required parameters in airdrop claim' 
        }),
      }).catch(error => console.error('Failed to trigger auto-block check:', error));
      
      return NextResponse.json({ success: false, error: 'Missing fid, address, or username (or username is empty)' }, { status: 400 });
    }
    
    // Log request for debugging with IP
    console.log(`🎯 AIRDROP CLAIM: IP=${clientIP}, FID=${fid}, address=${address}, username=${username || 'unknown'}, hasNotifications=${hasNotifications}`);
    
    // IMMEDIATE BLOCK for known abuser
    if (fid === 521172 || username === 'nancheng' || address === '0x52d24FEcCb7C546ABaE9e89629c9b417e48FaBD2') {
      console.log(`🚫 BLOCKED ABUSER: IP=${clientIP}, FID=${fid}, username=${username}, address=${address}`);
      return NextResponse.json({ success: false, error: 'Access Denied' }, { status: 403 });
    }
    

    
    // Validate Mini App user AND verify wallet address
    const userValidation = await validateMiniAppUser(fid, username, address);
    if (!userValidation.isValid) {
      console.log(`User validation failed for FID ${fid}: ${userValidation.error}`);
      
      return NextResponse.json({ 
        success: false, 
        error: userValidation.error || 'Invalid user or spoofed request' 
      }, { status: 400 });
    }
    
    // Special logging for test user, but proceed with normal flow
    if (username === TEST_USERNAME) {
      console.log(`Test user ${TEST_USERNAME} claiming airdrop - proceeding with normal contract call`);
    }
    
    // Require notifications to be enabled - this comes from the client
    // which captures the frameContext.client.notificationDetails
    if (!hasNotifications) {
      const errorMessage = 'User has not added frame with notifications enabled';
      console.log(`User ${fid} attempted to claim without notifications enabled`);
      
      // Log notification error
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: errorMessage,
        error_code: 'NOTIFICATIONS_DISABLED',
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({ 
        success: false, 
        error: errorMessage 
      }, { status: 400 });
    }
    
    // Check if user has already claimed (check address first, then FID)
    // IMPORTANT: Each address can only claim once, regardless of FID
    const { data: claimDataByAddress, error: selectErrorByAddress } = await supabase
      .from('airdrop_claims')
      .select('*')
      .eq('eth_address', address)
      .single();
    
    if (selectErrorByAddress && selectErrorByAddress.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status by address:', selectErrorByAddress);
      
      // Log database error
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: 'Database error when checking claim status by address',
        error_code: selectErrorByAddress?.code || 'DB_SELECT_ERROR',
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this address has already claimed - this is the primary check
    if (claimDataByAddress) {
      console.log(`Address ${address} has already claimed at tx ${claimDataByAddress.tx_hash} by FID ${claimDataByAddress.fid}`);
      
      // Log duplicate claim attempt
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: `Address has already claimed the airdrop (previously claimed by FID ${claimDataByAddress.fid})`,
        error_code: 'DUPLICATE_CLAIM',
        tx_hash: claimDataByAddress.tx_hash,
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({ 
        success: false, 
        error: 'This wallet address has already claimed the airdrop',
        tx_hash: claimDataByAddress.tx_hash
      }, { status: 400 });
    }

    // Secondary check: if this FID has already claimed (with a different address)
    const { data: claimDataByFid, error: selectErrorByFid } = await supabase
      .from('airdrop_claims')
      .select('*')
      .eq('fid', fid)
      .single();
    
    if (selectErrorByFid && selectErrorByFid.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status by FID:', selectErrorByFid);
      
      // Log database error
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: 'Database error when checking claim status by FID',
        error_code: selectErrorByFid?.code || 'DB_SELECT_ERROR',
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this FID has already claimed with a different address
    if (claimDataByFid) {
      console.log(`FID ${fid} has already claimed at tx ${claimDataByFid.tx_hash} with address ${claimDataByFid.eth_address}`);
      
      // Log duplicate claim attempt
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: `FID has already claimed the airdrop with address ${claimDataByFid.eth_address}`,
        error_code: 'DUPLICATE_CLAIM_FID',
        tx_hash: claimDataByFid.tx_hash,
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({ 
        success: false, 
        error: 'This Farcaster account has already claimed the airdrop',
        tx_hash: claimDataByFid.tx_hash
      }, { status: 400 });
    }
    
    // Initialize ethers provider and get wallet from pool
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const walletPool = getWalletPool(provider);
    
    // Check if we should use direct wallet (pool disabled for this purpose)
    const directWallet = walletPool.getDirectWallet('main-airdrop');
    
    let adminWallet: ethers.Wallet;
    let DYNAMIC_AIRDROP_CONTRACT: string;
    let lockKey: string | null = null;
    let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
    
    if (directWallet) {
      // Use direct wallet without pool logic
      console.log(`Using direct wallet ${directWallet.wallet.address} (pool disabled for main-airdrop)`);
      adminWallet = directWallet.wallet;
      DYNAMIC_AIRDROP_CONTRACT = directWallet.airdropContract;
    } else {
      // Use wallet pool
      try {
        walletConfig = await walletPool.getAvailableWallet('main-airdrop');
        console.log(`Using wallet ${walletConfig.wallet.address} with contract ${walletConfig.airdropContract}`);
        adminWallet = walletConfig.wallet;
        DYNAMIC_AIRDROP_CONTRACT = walletConfig.airdropContract;
        lockKey = walletConfig.lockKey;
      } catch (poolError) {
        const errorMessage = 'All wallets are currently busy. Please try again in a moment.';
        console.error('Failed to get wallet from pool:', poolError);
        
        await logFailedTransaction({
          fid: fid as number,
          eth_address: address as string,
          username,
          error_message: errorMessage,
          error_code: 'WALLET_POOL_BUSY',
          request_data: requestData as Record<string, unknown>,
          network_status: 'pool_busy'
        });
        
        return NextResponse.json({ 
          success: false, 
          error: errorMessage
        }, { status: 503 });
      }
    }
    
    try {
      // Check wallet balance before proceeding
      const balance = await provider.getBalance(adminWallet.address);
      console.log(`Wallet ${adminWallet.address} balance: ${ethers.formatEther(balance)} ETH`);
      
      if (balance < ethers.parseEther("0.001")) {
        const errorMessage = 'Admin wallet has insufficient ETH for gas. Please contact support.';
        console.error(`Wallet ${adminWallet.address} has insufficient ETH for gas`);
        
        // Log insufficient funds error
        await logFailedTransaction({
          fid: fid as number,
          eth_address: address as string,
          username,
          error_message: errorMessage,
          error_code: 'INSUFFICIENT_GAS',
          request_data: requestData as Record<string, unknown>,
          gas_price: ethers.formatEther(balance),
          network_status: 'low_funds'
        });
        
        return NextResponse.json({ 
          success: false, 
          error: errorMessage
        }, { status: 500 });
      }
    
    // Define airdrop amount (2,000 QR tokens)
    // Assuming 18 decimals for the QR token
    const airdropAmount = ethers.parseUnits('1000', 18);
    
          console.log(`Preparing airdrop of 1,000 QR tokens to ${address}`);
    
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
      
      if (tokenBalance < airdropAmount) {
        const errorMessage = 'Admin wallet has insufficient QR tokens for airdrop. Please contact support.';
        console.error("Admin wallet has insufficient QR tokens for airdrop");
        
        // Log insufficient token error
        await logFailedTransaction({
          fid: fid as number,
          eth_address: address as string,
          username,
          error_message: errorMessage,
          error_code: 'INSUFFICIENT_TOKENS',
          request_data: requestData as Record<string, unknown>,
          network_status: 'low_tokens'
        });
        
        return NextResponse.json({ 
          success: false, 
          error: errorMessage
        }, { status: 500 });
      }
      
      const allowance = await qrTokenContract.allowance(adminWallet.address, DYNAMIC_AIRDROP_CONTRACT);
      console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
      
      if (allowance < airdropAmount) {
        console.log('Approving tokens for transfer...');
        
        try {
          // Approve the airdrop contract to spend the tokens
          const approveTx = await qrTokenContract.approve(
            DYNAMIC_AIRDROP_CONTRACT,
            airdropAmount
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
              // Don't throw - let the airdrop attempt proceed, it might work if approval went through
            } else {
              throw raceError;
            }
          }
        } catch (approveError: unknown) {
          console.error('Error approving tokens:', approveError);
          
          const errorMessage = approveError instanceof Error 
            ? approveError.message 
            : 'Unknown approval error';
          
          const txHash = (approveError as { hash?: string }).hash;
          
          // Log token approval error
          await logFailedTransaction({
            fid: fid as number,
            eth_address: address as string,
            username,
            error_message: `Token approval failed: ${errorMessage}`,
            error_code: 'APPROVAL_FAILED',
            request_data: requestData as Record<string, unknown>,
            tx_hash: txHash || undefined,
            network_status: 'approval_failed'
          });
          
          return NextResponse.json({ 
            success: false, 
            error: 'Failed to approve tokens for transfer. Please try again later.' 
          }, { status: 500 });
        }
      } else {
        console.log('Sufficient allowance already exists, skipping approval');
      }
    } catch (error: unknown) {
      console.error('Error checking token balance or approving tokens:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error checking token balance';
      
      const errorCode = (error as { code?: string }).code;
      
      // Log token check error
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: `Failed to check token balance: ${errorMessage}`,
        error_code: errorCode || 'TOKEN_CHECK_FAILED',
        request_data: requestData as Record<string, unknown>,
        network_status: errorCode || 'unknown'
      });
      
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check token balance or approve tokens. Please try again later.' 
      }, { status: 500 });
    }
    
    // Prepare airdrop content
    const airdropContent = [{
      recipient: address,
      amount: airdropAmount
    }];
    
    console.log('Executing airdrop...');
    
    // Execute the airdrop with retry logic
    try {
      // Wrap the transaction in the retry function
      const receipt = await executeWithRetry(async (attempt) => {
        // Get fresh nonce each time
        const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
        console.log(`Using nonce: ${nonce} for airdrop transaction, attempt: ${attempt}`);
        
        // Increase gas price with each retry attempt
        const gasPrice = await provider.getFeeData().then(feeData => 
          feeData.gasPrice ? feeData.gasPrice * BigInt(130 + attempt * 20) / BigInt(100) : undefined
        );
        
        const gasLimit = 500000; // Higher gas limit for safety
        
        try {
          // Execute the airdrop with explicit nonce and higher gas limit
          const tx = await airdropContract.airdropERC20(
            QR_TOKEN_ADDRESS,
            airdropContent,
            {
              nonce,
              gasLimit,
              gasPrice // Increasing gas price with each retry
            }
          );
          
          console.log(`Airdrop tx submitted: ${tx.hash}`);
          
          // Add timeout wrapper to prevent Vercel timeout (55 seconds to be safe)
          const airdropPromise = tx.wait();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Airdrop transaction timeout after 55 seconds')), 55000)
          );
          
          try {
            const receipt = await Promise.race([airdropPromise, timeoutPromise]) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            console.log(`Airdrop confirmed in block ${receipt.blockNumber}`);
            return receipt;
          } catch (timeoutError) {
            if (timeoutError instanceof Error && timeoutError.message.includes('timeout')) {
              console.log('Airdrop transaction timed out, logging for retry queue');
              // Transaction submitted but timed out - it will be queued for retry
              throw new Error(`Transaction timeout - tx hash: ${tx.hash}`);
            }
            throw timeoutError;
          }
        } catch (txError: unknown) {
          // Log transaction error details for each attempt
          console.error(`Transaction attempt ${attempt} failed:`, txError);
          
          const txErrorMessage = txError instanceof Error 
            ? txError.message 
            : 'Unknown transaction error';
          
          const errorCode = (txError as { code?: string }).code;
          const txHash = (txError as { hash?: string }).hash;
          
          // Only log to database if this is the final attempt or a non-retryable error
          const isRetryable = txErrorMessage.includes('replacement fee too low') ||
                            txErrorMessage.includes('nonce has already been used') ||
                            txErrorMessage.includes('transaction underpriced') ||
                            txErrorMessage.includes('timeout') ||
                            txErrorMessage.includes('network error');
          
          if (!isRetryable || attempt >= 3) {
            await logFailedTransaction({
              fid: fid as number,
              eth_address: address as string,
              username,
              error_message: `Transaction failed: ${txErrorMessage}`,
              error_code: errorCode || 'TX_ERROR',
              tx_hash: txHash || undefined,
              request_data: requestData as Record<string, unknown>,
              gas_price: gasPrice?.toString() || undefined,
              gas_limit: gasLimit,
              network_status: 'tx_failed',
              retry_count: attempt
            });
          }
          
          throw txError; // Re-throw for retry mechanism
        }
      });
      
      // Record the claim in the database
      const { error: insertError } = await supabase
        .from('airdrop_claims')
        .insert({
          fid: fid,
          eth_address: address,
          amount: 1000, // 1,000 QR tokens
          tx_hash: receipt.hash,
          success: true,
          username: username
        });
        
      if (insertError) {
        console.error('Error recording claim:', insertError);
        
        // Check if this is a unique constraint violation on eth_address
        if (insertError.code === '23505' && insertError.message?.includes('airdrop_claims_eth_address_unique')) {
          console.log(`Database constraint prevented duplicate claim for address ${address}`);
          
          // Log this as a duplicate claim attempt that was caught by DB constraint
          await logFailedTransaction({
            fid: fid as number,
            eth_address: address as string,
            username,
            error_message: `Address has already claimed the airdrop (caught by database constraint)`,
            error_code: 'DUPLICATE_CLAIM_DB_CONSTRAINT',
            tx_hash: receipt.hash,
            request_data: requestData as Record<string, unknown>,
            network_status: 'tx_success_db_constraint'
          });
          
          return NextResponse.json({ 
            success: false, 
            error: 'This wallet address has already claimed the airdrop',
            warning: 'Airdrop transaction was successful but claim was already recorded'
          }, { status: 400 });
        }
        
        // Log other database insert errors
        await logFailedTransaction({
          fid: fid as number,
          eth_address: address as string,
          username,
          error_message: `Failed to record successful claim: ${insertError.message}`,
          error_code: insertError.code || 'DB_INSERT_ERROR',
          tx_hash: receipt.hash,
          request_data: requestData as Record<string, unknown>,
          network_status: 'tx_success_db_fail'
        });
        
        return NextResponse.json({ 
          success: true, 
          warning: 'Airdrop successful but failed to record claim',
          tx_hash: receipt.hash
        });
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'Airdrop claimed successfully',
        tx_hash: receipt.hash
      });
    } catch (error: unknown) {
      console.error('Airdrop claim error:', error);
      
      // Try to provide more specific error messages for common issues
      let errorMessage = 'Failed to process airdrop claim';
      let errorCode = 'UNKNOWN_ERROR';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds in admin wallet for gas';
          errorCode = 'INSUFFICIENT_FUNDS';
        } else if (error.message.includes('execution reverted')) {
          errorMessage = 'Contract execution reverted: ' + error.message.split('execution reverted:')[1]?.trim() || 'unknown reason';
          errorCode = 'CONTRACT_REVERT';
        } else if (error.message.includes('timeout')) {
          errorCode = 'TIMEOUT';
        } else if (error.message.includes('rate limit')) {
          errorCode = 'RATE_LIMIT';
        }
      }
      
      // Log the final error after all retries
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: errorMessage,
        error_code: errorCode,
        request_data: requestData as Record<string, unknown>,
        network_status: 'failed'
      });
      
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
    console.error('Airdrop claim unexpected error:', error);
    
    // Try to provide more specific error messages for common issues
    let errorMessage = 'Failed to process airdrop claim';
    let errorCode = 'UNEXPECTED_ERROR';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds in admin wallet for gas';
        errorCode = 'INSUFFICIENT_FUNDS';
      } else if (error.message.includes('execution reverted')) {
        errorMessage = 'Contract execution reverted: ' + error.message.split('execution reverted:')[1]?.trim() || 'unknown reason';
        errorCode = 'CONTRACT_REVERT';
      } else if (error.message.includes('timeout')) {
        errorCode = 'TIMEOUT';
      } else if (error.message.includes('rate limit')) {
        errorCode = 'RATE_LIMIT';
      }
    }
    
              // Attempt to log error even in case of unexpected errors
    try {
      await logFailedTransaction({
        fid: typeof fid === 'number' ? fid : 0,
        eth_address: typeof address === 'string' ? address : 'unknown',
        username: username,
        error_message: errorMessage,
        error_code: errorCode,
        request_data: requestData as Record<string, unknown>,
        network_status: 'unexpected_error'
      });
      } catch (logError) {
      console.error('Failed to log unexpected error:', logError);
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 
