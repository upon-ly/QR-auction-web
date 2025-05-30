import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { validateMiniAppUser } from '@/utils/miniapp-validation';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';



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
interface LinkVisitRequestData {
  fid?: number; // Optional for web users
  address: string;
  auction_id: string;
  username?: string;
  winning_url?: string;
  claim_source?: string;
  [key: string]: unknown; // Allow other properties
}

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Import queue functionality
import { queueFailedClaim } from '@/lib/queue/failedClaims';

// Function to log errors to the database
async function logFailedTransaction(params: {
  fid: number | string;
  eth_address: string;
  auction_id: string;
  username?: string | null;
  winning_url?: string | null;
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
    // Use the provided client IP directly, with fallback extraction from request_data
    const clientIP = params.client_ip || 
      (params.request_data?.clientIP as string) || 
      'unknown';

    console.log(`🗂️ Logging failed transaction: IP=${clientIP}, FID=${params.fid}, Error=${params.error_code}`);

    // Your existing database insert code
    const { data, error } = await supabase
      .from('link_visit_claim_failures')
      .insert({
        fid: params.fid,
        eth_address: params.eth_address,
        auction_id: params.auction_id,
        username: params.username || null,
        winning_url: params.winning_url || null,
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
    // Don't queue permanent validation failures that will never succeed
    const nonRetryableErrors = [
      'DUPLICATE_CLAIM', 
      'DUPLICATE_CLAIM_FID', 
      'DUPLICATE_CLAIM_ADDRESS', 
      'INVALID_AUCTION_ID', 
      'INVALID_USER', 
      'VALIDATION_ERROR',
      'ADDRESS_NOT_VERIFIED'
    ];
    
    if (!nonRetryableErrors.includes(params.error_code || '')) {
      await queueFailedClaim({
        id: data.id,
        fid: typeof params.fid === 'number' ? params.fid : 0, // Use 0 for string FIDs (web users)
        eth_address: params.eth_address,
        auction_id: params.auction_id,
        username: params.username as string | null,
        winning_url: params.winning_url as string | null,
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
  let requestData: Partial<LinkVisitRequestData> = {};
  
  // Get client IP for logging
  const clientIP = getClientIP(request, true); // Enable debug mode temporarily
  
  console.log(`🌐 REQUEST IP DEBUGGING: Detected IP=${clientIP}`);
  
  // Rate limiting FIRST: 3 requests per minute per IP (before any processing)
  if (isRateLimited(clientIP, 3, 60000)) {
    console.log(`🚫 RATE LIMITED: IP=${clientIP} (too many link visit claim requests)`);
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
    
    // Parse request body
    requestData = await request.json() as LinkVisitRequestData;
    const { fid, address, auction_id, username, winning_url, claim_source } = requestData;
    
    // Log all requests with IP
    console.log(`💰 LINK VISIT CLAIM: IP=${clientIP}, FID=${fid || 'none'}, auction=${auction_id}, address=${address || 'none'}, username=${username || 'none'}, source=${claim_source || 'mini_app'}`);
    
    // IMMEDIATE BLOCK for known abuser (before any validation) - only for mini-app users
    if (claim_source !== 'web' && (fid === 521172 || username === 'nancheng' || address === '0x52d24FEcCb7C546ABaE9e89629c9b417e48FaBD2')) {
      console.log(`🚫 BLOCKED ABUSER: IP=${clientIP}, FID=${fid}, username=${username}, address=${address}`);
      return NextResponse.json({ success: false, error: 'Access Denied' }, { status: 403 });
    }
    
    // Validate required parameters based on context
    let effectiveFid: number;
    let effectiveUsername: string | null = null;
    
    if (claim_source === 'web') {
      // Web users need address and auction_id
      if (!address || !auction_id) {
        console.log(`🚫 WEB VALIDATION ERROR: IP=${clientIP}, Missing required parameters (address or auction_id). Received: address=${address}, auction_id=${auction_id}`);

        const addressHash = address?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        effectiveFid = -(hashNumber % 1000000000);
        
        await logFailedTransaction({
          fid: effectiveFid, // Use -1 for web validation errors
          eth_address: address || 'unknown',
          auction_id: auction_id || 'unknown',
          username: null,
          winning_url: null,
          error_message: 'Missing required parameters for web user (address or auction_id)',
          error_code: 'WEB_VALIDATION_ERROR',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ success: false, error: 'Missing required parameters (address or auction_id)' }, { status: 400 });
      }
      // Create a unique negative FID from wallet address hash for web users
      const addressHash = address.slice(2).toLowerCase(); // Remove 0x and lowercase
      const hashNumber = parseInt(addressHash.slice(0, 8), 16); // Take first 8 hex chars
      effectiveFid = -(hashNumber % 1000000000); // Make it negative and limit size
      effectiveUsername = 'qrcoinweb'; // Use specific username for web users
    } else {
      // Mini-app users need fid, address, auction_id, and username
      if (!fid || !address || !auction_id || !username) {
        console.log(`🚫 MINI-APP VALIDATION ERROR: IP=${clientIP}, Missing required parameters (fid, address, auction_id, or username). Received: fid=${fid}, address=${address}, auction_id=${auction_id}, username=${username}`);
        
        await logFailedTransaction({
          fid: fid || 0,
          eth_address: address || 'unknown',
          auction_id: auction_id || 'unknown',
          username: username || undefined,
          winning_url: null,
          error_message: 'Missing required parameters for mini-app user (fid, address, auction_id, or username)',
          error_code: 'MINIAPP_VALIDATION_ERROR',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ success: false, error: 'Missing required parameters (fid, address, auction_id, or username)' }, { status: 400 });
      }
      effectiveFid = fid; // Use actual fid for mini-app users
      effectiveUsername = username; // Use actual username for mini-app users
    }
    
    // Validate that this is the latest settled auction
    try {
      // Get the latest won auction from winners table
      const { data: latestWinner, error } = await supabase
        .from('winners')
        .select('token_id')
        .order('token_id', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching latest won auction:', error);
        return NextResponse.json({ 
          success: false, 
          error: 'Error validating auction ID' 
        }, { status: 500 });
      }
      
      if (!latestWinner || latestWinner.length === 0) {
        console.error('No won auctions found');
        return NextResponse.json({ 
          success: false, 
          error: 'No won auctions found' 
        }, { status: 400 });
      }
      
      const latestWonId = parseInt(latestWinner[0].token_id);
      const requestedId = parseInt(auction_id);
      
      // ONLY allow claims for the latest won auction (not future auctions)
      // This ensures all claims are recorded for the actual latest won auction
      const isValidAuction = requestedId === latestWonId;
      
      console.log(`Validating auction claim: requested=${requestedId}, latest won=${latestWonId}, isValid=${isValidAuction}`);
      
      if (!isValidAuction) {
        const errorMessage = `Invalid auction ID - can only claim from latest won auction (${latestWonId})`;
        
        // Don't queue failed transactions for invalid auction IDs - these are user errors/gaming attempts
        return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
      }
    } catch (error) {
      console.error('Error validating auction ID:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Error validating auction ID' 
      }, { status: 500 });
    }
    
    // Default winning URL if not provided
    const winningUrl = winning_url || `https://qrcoin.fun/auction/${auction_id}`;
    
    // Additional detailed logging
    console.log(`📋 DETAILED CLAIM: IP=${clientIP}, FID=${fid}, address=${address}, auction=${auction_id}, username=${username || 'unknown'}`);
    
    // Validate Mini App user and verify wallet address in one call (skip for web users)
    if (claim_source !== 'web') {
      const userValidation = await validateMiniAppUser(effectiveFid, effectiveUsername || undefined, address);
      if (!userValidation.isValid) {
        console.log(`User validation failed for FID ${effectiveFid}: ${userValidation.error}`);
        
        // Don't queue failed transactions for validation errors - just return error
        // These are user errors, not system failures that need retry
        return NextResponse.json({ 
          success: false, 
          error: userValidation.error || 'Invalid user or spoofed request' 
        }, { status: 400 });
      }
    }
    
    // Check if user has already claimed tokens for this auction (check both FID and address)
    let claimDataByFid = null;
    let selectErrorByFid = null;
    
    // Only check FID for mini-app users (skip for web users since they all use FID -1)
    if (claim_source !== 'web') {
      const fidCheck = await supabase
        .from('link_visit_claims')
        .select('*')
        .eq('fid', fid)
        .eq('auction_id', auction_id);
      
      claimDataByFid = fidCheck.data;
      selectErrorByFid = fidCheck.error;
    }
    
    const { data: claimDataByAddress, error: selectErrorByAddress } = await supabase
      .from('link_visit_claims')
      .select('*')
      .eq('eth_address', address)
      .eq('auction_id', auction_id);
    
    if (selectErrorByFid || selectErrorByAddress) {
      console.error('Error checking claim status:', selectErrorByFid || selectErrorByAddress);
      
      // Log database error
      await logFailedTransaction({
        fid: effectiveFid,
        eth_address: address,
        auction_id,
        username: effectiveUsername,
        error_message: 'Database error when checking claim status',
        error_code: (selectErrorByFid || selectErrorByAddress)?.code || 'DB_SELECT_ERROR',
        request_data: requestData as Record<string, unknown>,
        network_status: 'db_error',
        client_ip: clientIP
      });
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
    
    // Check if this FID has already claimed (only for mini-app users)
    if (claim_source !== 'web' && claimDataByFid && claimDataByFid.length > 0 && claimDataByFid[0].claimed_at) {
      if (claimDataByFid[0].tx_hash) {
        console.log(`User ${fid} has already claimed tokens for auction ${auction_id} at tx ${claimDataByFid[0].tx_hash}`);
        
        // Don't queue failed transactions for duplicate claims - these are user errors
        return NextResponse.json({ 
          success: false, 
          error: 'This Farcaster account has already claimed tokens for this auction',
          tx_hash: claimDataByFid[0].tx_hash
        }, { status: 400 });
      } else {
        // Incomplete claim by FID - delete and allow retry
        console.log(`Found incomplete claim for user ${fid}, auction ${auction_id} - allowing retry`);
        await supabase
          .from('link_visit_claims')
          .delete()
          .match({
            fid: fid,
            auction_id: auction_id
          });
      }
    }
    
    // Check if this address has already claimed
    if (claimDataByAddress && claimDataByAddress.length > 0 && claimDataByAddress[0].claimed_at) {
      if (claimDataByAddress[0].tx_hash) {
        console.log(`Address ${address} has already claimed tokens for auction ${auction_id} at tx ${claimDataByAddress[0].tx_hash}`);
        
        // Don't queue failed transactions for duplicate claims - these are user errors
        return NextResponse.json({ 
          success: false, 
          error: 'This wallet address has already claimed tokens for this auction',
          tx_hash: claimDataByAddress[0].tx_hash
        }, { status: 400 });
      } else {
        // Incomplete claim by address - delete and allow retry
        console.log(`Found incomplete claim for address ${address}, auction ${auction_id} - allowing retry`);
        await supabase
          .from('link_visit_claims')
          .delete()
          .match({
            eth_address: address,
            auction_id: auction_id
          });
      }
    }
    
    // Initialize ethers provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(getContractAddresses(claim_source).ADMIN_PRIVATE_KEY, provider);
    
    // Check wallet balance before proceeding
    const balance = await provider.getBalance(adminWallet.address);
    console.log(`Admin wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther("0.001")) {
      const errorMessage = 'Admin wallet has insufficient ETH for gas. Please contact support.';
      console.error("Admin wallet has insufficient ETH for gas");
      
      // Log insufficient funds error
      await logFailedTransaction({
        fid: effectiveFid,
        eth_address: address,
        auction_id,
        username: effectiveUsername,
        winning_url: winningUrl,
        error_message: errorMessage,
        error_code: 'INSUFFICIENT_GAS',
        request_data: requestData as Record<string, unknown>,
        gas_price: ethers.formatEther(balance),
        network_status: 'low_funds',
        client_ip: clientIP
      });
      
      return NextResponse.json({ 
        success: false, 
        error: errorMessage
      }, { status: 500 });
    }
    
    // Define airdrop amount (1,000 QR tokens)
    // Assuming 18 decimals for the QR token
    const airdropAmount = ethers.parseUnits('1000', 18);
    
    console.log(`Preparing airdrop of 1,000 QR tokens to ${address}`);
    
    // Create contract instances
    const airdropContract = new ethers.Contract(
      getContractAddresses(claim_source).AIRDROP_CONTRACT_ADDRESS,
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
          fid: effectiveFid,
          eth_address: address,
          auction_id,
          username: effectiveUsername,
          winning_url: winningUrl,
          error_message: errorMessage,
          error_code: 'INSUFFICIENT_TOKENS',
          request_data: requestData as Record<string, unknown>,
          network_status: 'low_tokens',
          client_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: errorMessage
        }, { status: 500 });
      }
      
      const allowance = await qrTokenContract.allowance(adminWallet.address, getContractAddresses(claim_source).AIRDROP_CONTRACT_ADDRESS);
      console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
      
      if (allowance < airdropAmount) {
        console.log('Approving tokens for transfer...');
        
        try {
          // Approve the airdrop contract to spend the tokens
          const approveTx = await qrTokenContract.approve(
            getContractAddresses(claim_source).AIRDROP_CONTRACT_ADDRESS,
            airdropAmount
          );
          
          console.log(`Approval tx submitted: ${approveTx.hash}`);
          
          // Add timeout wrapper around the wait to prevent Vercel timeouts
          const approvalPromise = approveTx.wait();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Approval transaction timeout after 399 seconds')), 399000)
          );
          
          await Promise.race([approvalPromise, timeoutPromise]);
          console.log('Approval confirmed');
        } catch (approveError: unknown) {
          console.error('Error approving tokens:', approveError);
          
          const errorMessage = approveError instanceof Error 
            ? approveError.message 
            : 'Unknown approval error';
            
          const txHash = (approveError as { hash?: string }).hash;
          
          // If this was a timeout error and we have a tx hash, check if approval actually succeeded
          if (errorMessage.includes('timeout') && txHash) {
            console.log('Approval timed out, checking if it actually succeeded on-chain...');
            try {
              const currentAllowance = await qrTokenContract.allowance(adminWallet.address, getContractAddresses(claim_source).AIRDROP_CONTRACT_ADDRESS);
              if (currentAllowance >= airdropAmount) {
                console.log('Approval actually succeeded on-chain despite timeout, continuing...');
                // Continue with the airdrop - don't return error
              } else {
                console.log('Approval did not succeed on-chain, logging failure...');
                // Log the timeout error and queue for retry
                await logFailedTransaction({
                  fid: effectiveFid,
                  eth_address: address,
                  auction_id,
                  username: effectiveUsername,
                  winning_url: winningUrl,
                  error_message: `Token approval timed out: ${errorMessage}`,
                  error_code: 'APPROVAL_TIMEOUT',
                  request_data: requestData as Record<string, unknown>,
                  tx_hash: txHash,
                  network_status: 'approval_timeout',
                  client_ip: clientIP
                });
                
                return NextResponse.json({ 
                  success: false, 
                  error: 'Token approval timed out. Your request has been queued for retry.' 
                }, { status: 500 });
              }
            } catch (recheckError) {
              console.error('Error rechecking allowance after timeout:', recheckError);
              // Fall through to normal error handling
            }
          }
          
          // Normal error handling for non-timeout errors or when recheck fails
          if (!errorMessage.includes('timeout') || !txHash) {
            // Log token approval error
            await logFailedTransaction({
              fid: effectiveFid,
              eth_address: address,
              auction_id,
              username: effectiveUsername,
              winning_url: winningUrl,
              error_message: `Token approval failed: ${errorMessage}`,
              error_code: 'APPROVAL_FAILED',
              request_data: requestData as Record<string, unknown>,
              tx_hash: txHash,
              network_status: 'approval_failed',
              client_ip: clientIP
            });
            
            return NextResponse.json({ 
              success: false, 
              error: 'Failed to approve tokens for transfer. Please try again later.' 
            }, { status: 500 });
          }
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
        fid: effectiveFid,
        eth_address: address,
        auction_id,
        username: effectiveUsername,
        winning_url: winningUrl,
        error_message: `Failed to check token balance: ${errorMessage}`,
        error_code: errorCode || 'TOKEN_CHECK_FAILED',
        request_data: requestData as Record<string, unknown>,
        network_status: errorCode || 'unknown',
        client_ip: clientIP
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
        
        const gasLimit = 5000000; // Higher gas limit for safety
        
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
          
          // Add timeout wrapper around the wait to prevent Vercel timeouts
          const airdropPromise = tx.wait();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Airdrop transaction timeout after 399 seconds')), 399000)
          );
          
          const receipt = await Promise.race([airdropPromise, timeoutPromise]);
          console.log(`Airdrop confirmed in block ${receipt.blockNumber}`);
          
          return receipt;
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
              fid: effectiveFid,
              eth_address: address,
              auction_id,
              username: effectiveUsername,
              winning_url: winningUrl,
              error_message: `Transaction failed: ${txErrorMessage}`,
              error_code: errorCode || 'TX_ERROR',
              tx_hash: txHash,
              request_data: requestData as Record<string, unknown>,
              gas_price: gasPrice?.toString(),
              gas_limit: gasLimit,
              network_status: 'tx_failed',
              retry_count: attempt,
              client_ip: clientIP
            });
          }
          
          throw txError; // Re-throw for retry mechanism
        }
      });
      
      // Insert a new record, don't upsert over existing record
      const { error: insertError } = await supabase
        .from('link_visit_claims')
        .insert({
          fid: effectiveFid,
          auction_id: auction_id,
          eth_address: address, 
          link_visited_at: new Date().toISOString(), // Ensure we mark it as visited
          claimed_at: new Date().toISOString(),
          amount: 1000, // 1,000 QR tokens
          tx_hash: receipt.hash,
          success: true,
          username: effectiveUsername,
          winning_url: winningUrl,
          claim_source: claim_source || 'mini_app'
        });
        
      if (insertError) {
        // If insert fails, try an update as fallback
        console.error('Error inserting claim record, trying update:', insertError);
        const { error: updateError } = await supabase
          .from('link_visit_claims')
          .update({
            eth_address: address,
            claimed_at: new Date().toISOString(),
            amount: 1000, // 1,000 QR tokens
            tx_hash: receipt.hash,
            success: true,
            username: effectiveUsername,
            winning_url: winningUrl,
            claim_source: claim_source || 'mini_app'
          })
          .match({
            fid: effectiveFid,
            auction_id: auction_id
          });
          
        if (updateError) {
          console.error('Error updating claim record:', updateError);
          
          // Log database insert/update error, but the airdrop was successful
          await logFailedTransaction({
            fid: effectiveFid,
            eth_address: address,
            auction_id,
            username: effectiveUsername,
            winning_url: winningUrl,
            error_message: `Failed to record successful claim: ${updateError.message}`,
            error_code: updateError.code || 'DB_INSERT_ERROR',
            tx_hash: receipt.hash,
            request_data: requestData as Record<string, unknown>,
            network_status: 'tx_success_db_fail',
            client_ip: clientIP
          });
          
          return NextResponse.json({ 
            success: true, 
            warning: 'Airdrop successful but failed to update claim record',
            tx_hash: receipt.hash
          });
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'Tokens claimed successfully',
        tx_hash: receipt.hash
      });
    } catch (error: unknown) {
      console.error('Token claim error:', error);
      
      // Try to provide more specific error messages for common issues
      let errorMessage = 'Failed to process token claim';
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
        fid: effectiveFid,
        eth_address: address,
        auction_id,
        username: effectiveUsername,
        winning_url: winningUrl,
        error_message: errorMessage,
        error_code: errorCode,
        request_data: requestData as Record<string, unknown>,
        network_status: 'failed',
        client_ip: clientIP
      });
      
      return NextResponse.json({ 
        success: false, 
        error: errorMessage
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error('Token claim unexpected error:', error);
    
    // Try to provide more specific error messages for common issues
    let errorMessage = 'Failed to process token claim';
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
    
    // Extract whatever information we can from the request
    const fidForLog = typeof requestData.fid === 'number' ? requestData.fid : (requestData.claim_source === 'web' ? -1 : 0);
    const addressForLog = typeof requestData.address === 'string' ? requestData.address : 'unknown';
    const auctionIdForLog = typeof requestData.auction_id === 'string' ? requestData.auction_id : 'unknown';
    const usernameForLog = requestData.claim_source === 'web' ? null : requestData.username;
    const winningUrlForLog = requestData.winning_url;
    
    // Attempt to log error even in case of unexpected errors
    try {
      await logFailedTransaction({
        fid: fidForLog,
        eth_address: addressForLog,
        auction_id: auctionIdForLog,
        username: usernameForLog || null,
        winning_url: winningUrlForLog || null,
        error_message: errorMessage,
        error_code: errorCode,
        request_data: requestData as Record<string, unknown>,
        network_status: 'unexpected_error',
        client_ip: clientIP
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