import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { validateMiniAppUser } from '@/utils/miniapp-validation';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';
import { PrivyClient } from '@privy-io/server-auth';
import { getWalletPool } from '@/lib/wallet-pool';

// Initialize Privy client for server-side authentication
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  process.env.PRIVY_APP_SECRET || ''
);

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

const NON_FC_CLAIM_SOURCES = ['web', 'mobile']

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';

// Use different contracts based on claim source
const getContractAddresses = (claimSource: string = 'mini_app') => {
  if (NON_FC_CLAIM_SOURCES.includes(claimSource)) {
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
  username?: string; // Optional - ignored for web users (uses verified Privy userId instead)
  winning_url?: string;
  claim_source?: string;
  captcha_token?: string; // Add captcha token
  [key: string]: unknown; // Allow other properties
}

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Import queue functionality
import { queueFailedClaim, redis } from '@/lib/queue/failedClaims';

// Function to log errors to the database
async function logFailedTransaction(params: {
  fid: number | string;
  eth_address: string;
  auction_id: string;
  username?: string | null;
  user_id?: string | null; // Add user_id parameter
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
    // Check if this error is retryable BEFORE logging to database
    // These errors will NOT be logged to the failure table or queued for retry
    const nonRetryableErrors = [
      'DUPLICATE_CLAIM', 
      'DUPLICATE_CLAIM_FID', 
      'DUPLICATE_CLAIM_ADDRESS', 
      'INVALID_AUCTION_ID', 
      'INVALID_USER', 
      'VALIDATION_ERROR',
      'ADDRESS_NOT_VERIFIED',
      'IP_AUCTION_LIMIT_EXCEEDED', // Legitimate claims blocked by IP limits (web users)
      'IP_DAILY_LIMIT_EXCEEDED',   // Legitimate claims blocked by IP limits (web users)
      'WEB_VALIDATION_ERROR',      // Missing parameters for web users
      'MINIAPP_VALIDATION_ERROR',  // Missing parameters for mini-app users
      'INVALID_MINIAPP_FID',       // Invalid FID values
      'WEB_AUTH_ERROR',            // Invalid Privy authentication tokens
      'WEB_USERNAME_REQUIRED',     // Missing username for web claims
      'BANNED_USERNAME_ATTEMPT',   // Banned username attempted claim
      'BANNED_USER'                // User is banned
    ];
    
    // Only log to database if this will be queued for retry
    if (nonRetryableErrors.includes(params.error_code || '')) {
      console.log(`🚫 NOT LOGGING: Error code ${params.error_code} is non-retryable - skipping failure table`);
      return; // Don't log non-retryable errors
    }
    
    // Use the provided client IP directly, with fallback extraction from request_data
    const clientIP = params.client_ip || 
      (params.request_data?.clientIP as string) || 
      'unknown';

    console.log(`🗂️ Logging failed transaction: IP=${clientIP}, FID=${params.fid}, Error=${params.error_code} (WILL BE QUEUED)`);

    // ANTI-SPAM: Check for existing failure records to prevent duplicate queue entries
    const existingFailureChecks = [];

    // Check 1: Same username + auction_id (if username provided)
    if (params.username) {
      existingFailureChecks.push(
        supabase
          .from('link_visit_claim_failures')
          .select('id')
          .eq('username', params.username)
          .eq('auction_id', params.auction_id)
          .limit(1)
      );
      
      // ENHANCED: Also check for recent failures from same username (last 1 minute)
      existingFailureChecks.push(
        supabase
          .from('link_visit_claim_failures')
          .select('id')
          .eq('username', params.username)
          .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last 1 minute
          .limit(1)
      );
    }

    // Check 2: Same eth_address + auction_id
    if (params.eth_address && params.eth_address !== 'unknown') {
      existingFailureChecks.push(
        supabase
          .from('link_visit_claim_failures')
          .select('id')
          .eq('eth_address', params.eth_address)
          .eq('auction_id', params.auction_id)
          .limit(1)
      );
    }

    // Check 3: Same fid + auction_id (for mini-app users)
    if (typeof params.fid === 'number' && params.fid > 0) {
      existingFailureChecks.push(
        supabase
          .from('link_visit_claim_failures')
          .select('id')
          .eq('fid', params.fid)
          .eq('auction_id', params.auction_id)
          .limit(1)
      );
    }

    // Check 4: ENHANCED - Same IP + auction_id with recent timestamp (prevent IP spam)
    if (params.client_ip && params.client_ip !== 'unknown') {
      existingFailureChecks.push(
        supabase
          .from('link_visit_claim_failures')
          .select('id')
          .eq('client_ip', params.client_ip)
          .eq('auction_id', params.auction_id)
          .gte('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
          .limit(1)
      );
    }

    // Execute all checks in parallel
    const existingFailureResults = await Promise.all(existingFailureChecks);
    
    // If any check found an existing failure, skip logging
    const hasExistingFailure = existingFailureResults.some(result => 
      result.data && result.data.length > 0
    );

    if (hasExistingFailure) {
      // Determine which type of duplicate was found for better logging
      let duplicateType = 'unknown';
      let checkIndex = 0;
      
      if (params.username) {
        if (existingFailureResults[checkIndex]?.data && existingFailureResults[checkIndex].data!.length > 0) {
          duplicateType = 'username+auction';
        } else if (existingFailureResults[checkIndex + 1]?.data && existingFailureResults[checkIndex + 1].data!.length > 0) {
          duplicateType = 'username cooldown (1min)';
        }
        checkIndex += 2;
      }
      
      if (duplicateType === 'unknown' && params.eth_address && params.eth_address !== 'unknown') {
        if (existingFailureResults[checkIndex]?.data && existingFailureResults[checkIndex].data!.length > 0) {
          duplicateType = 'address+auction';
        }
        checkIndex += 1;
      }
      
      if (duplicateType === 'unknown' && typeof params.fid === 'number' && params.fid > 0) {
        if (existingFailureResults[checkIndex]?.data && existingFailureResults[checkIndex].data!.length > 0) {
          duplicateType = 'fid+auction';
        }
        checkIndex += 1;
      }
      
      if (duplicateType === 'unknown' && params.client_ip && params.client_ip !== 'unknown') {
        if (existingFailureResults[checkIndex]?.data && existingFailureResults[checkIndex].data!.length > 0) {
          duplicateType = 'IP cooldown (30sec)';
        }
      }

      console.log(`🚫 SKIPPING DUPLICATE FAILURE (${duplicateType}): FID=${params.fid}, username=${params.username}, address=${params.eth_address}, auction=${params.auction_id}, IP=${clientIP}`);
      return; // Don't log duplicate failures
    }

    // No existing failure found - proceed with logging
    const { data, error } = await supabase
      .from('link_visit_claim_failures')
      .insert({
        fid: params.fid,
        eth_address: params.eth_address,
        auction_id: params.auction_id,
        username: params.username || null,
        user_id: params.user_id || null,
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
    
    console.log(`✅ LOGGED NEW FAILURE: ID=${data.id}, FID=${params.fid}, Error=${params.error_code}`);
    
    // Now queue for retry since we only log retryable errors
    await queueFailedClaim({
      id: data.id,
      fid: typeof params.fid === 'number' ? params.fid : 0, // Use 0 for string FIDs (web users)
      eth_address: params.eth_address,
      auction_id: params.auction_id,
      username: params.username as string | null,
      user_id: params.user_id as string | null,
      winning_url: params.winning_url as string | null,
    });
    console.log(`📋 QUEUED FOR RETRY: Failure ID=${data.id}`);
  } catch (logError) {
    console.error('Error while logging to failure table:', logError);
  }
}

// Function to retry transactions with exponential backoff
async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000,
  txHashCallback?: (hash: string) => void
): Promise<T> {
  let attempt = 0;
  let lastError: Error | unknown;
  let lastTxHash: string | undefined;

  while (attempt <= maxRetries) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      
      // Extract transaction hash if available for tracking
      if (error && typeof error === 'object' && 'hash' in error) {
        lastTxHash = (error as { hash?: string }).hash;
        if (txHashCallback && lastTxHash) {
          txHashCallback(lastTxHash);
        }
      }
      
      // Check if this is a retryable error
      const isRetryable = error instanceof Error && (
        error.message?.includes('replacement fee too low') ||
        error.message?.includes('nonce has already been used') ||
        error.message?.includes('transaction underpriced') ||
        error.message?.includes('timeout') ||
        error.message?.includes('network error') ||
        error.message?.includes('transaction execution reverted')
      );
      
      // For timeout errors, check if the transaction actually succeeded
      if (error instanceof Error && error.message?.includes('timeout') && lastTxHash) {
        console.log(`Transaction timed out, checking on-chain status for tx: ${lastTxHash}`);
        try {
          const provider = new ethers.JsonRpcProvider(RPC_URL);
          const txReceipt = await provider.getTransactionReceipt(lastTxHash);
          if (txReceipt && txReceipt.status === 1) {
            console.log(`Transaction ${lastTxHash} actually succeeded on-chain despite timeout`);
            return txReceipt as T;
          }
        } catch (checkError) {
          console.error('Error checking transaction status:', checkError);
        }
      }
      
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
  let lockKey: string | undefined;
  let fidLockKey: string | undefined;
  let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
  let walletPool: ReturnType<typeof getWalletPool> | null = null;
  
  // Get client IP for logging
  const clientIP = getClientIP(request, true); // Enable debug mode temporarily
  
  console.log(`🌐 REQUEST IP DEBUGGING: Detected IP=${clientIP}`);
  
  try {
    // Validate API key first
    const apiKey = request.headers.get('x-api-key');
    const validApiKey = process.env.LINK_CLICK_API_KEY;
    
    if (!apiKey || !validApiKey || apiKey !== validApiKey) {
      console.error(`🚨 UNAUTHORIZED ACCESS from IP: ${clientIP}`);
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse request body to determine claim source for differentiated rate limiting
    requestData = await request.json() as LinkVisitRequestData;
    const { fid, address, auction_id, username, winning_url, claim_source } = requestData;
    
    // Differentiated rate limiting: Web (2/min) vs Mini-app (3/min)
    const rateLimit = NON_FC_CLAIM_SOURCES.includes(claim_source || '') ? 2 : 3;
    const rateLimitWindow = 60000; // 1 minute
    
    if (isRateLimited(clientIP, rateLimit, rateLimitWindow)) {
      console.log(`🚫 RATE LIMITED: IP=${clientIP} (${NON_FC_CLAIM_SOURCES.includes(claim_source || '') ? 'web/mobile' : 'mini-app'}: ${rateLimit} requests/min exceeded)`);
      return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
    }
    
    // Log all requests with IP
    console.log(`💰 LINK VISIT CLAIM: IP=${clientIP}, FID=${fid || 'none'}, auction=${auction_id}, address=${address || 'none'}, username=${username || 'none'}, source=${claim_source || 'mini_app'}`);
    
    // IP-based anti-bot validation (WEB USERS ONLY)
    if (NON_FC_CLAIM_SOURCES.includes(claim_source || '')) {
      console.log(`🛡️ IP VALIDATION: Checking IP ${clientIP} for web claim protection`);
      
      // Check 1: Max 3 claims per IP per auction
      const { data: ipClaimsThisAuction } = await supabase
        .from('link_visit_claims')
        .select('id, claimed_at, eth_address')
        .eq('auction_id', auction_id)
        .eq('client_ip', clientIP)
        .not('claimed_at', 'is', null);
      
      if (ipClaimsThisAuction && ipClaimsThisAuction.length >= 3) {
        console.log(`🚫 IP AUCTION LIMIT EXCEEDED: IP=${clientIP} has ${ipClaimsThisAuction.length} claims for auction ${auction_id} (limit: 3)`);
        
        await logFailedTransaction({
          fid: -1,
          eth_address: address || 'unknown',
          auction_id: auction_id || 'unknown',
          username: username || null,
          user_id: null, // IP limit failures don't have user context
          winning_url: winning_url || null,
          error_message: `IP ${clientIP} exceeded per-auction limit: ${ipClaimsThisAuction.length}/3 claims`,
          error_code: 'IP_AUCTION_LIMIT_EXCEEDED',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Rate limit exceeded for this auction',
          code: 'IP_AUCTION_LIMIT_EXCEEDED'
        }, { status: 429 });
      }
      
      // Check 2: Max 5 claims per IP per 24 hours
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      const { data: ipClaimsDaily, error: ipDailyError } = await supabase
        .from('link_visit_claims')
        .select('id, claimed_at, auction_id')
        .eq('client_ip', clientIP)
        .gte('claimed_at', yesterday.toISOString())
        .not('claimed_at', 'is', null);
      
      if (ipDailyError) {
        console.error('Error checking IP daily claims:', ipDailyError);
      } else if (ipClaimsDaily && ipClaimsDaily.length >= 5) {
        console.log(`🚫 IP DAILY LIMIT: IP=${clientIP} has ${ipClaimsDaily.length} claims in 24h (max: 5)`);
        
        // Log this as a blocked attempt
        await logFailedTransaction({
          fid: -1,
          eth_address: address || 'unknown',
          auction_id: auction_id || 'unknown',
          username: username || null,
          user_id: null, // IP limit failures don't have user context
          winning_url: winning_url || null,
          error_message: `IP ${clientIP} exceeded daily limit (${ipClaimsDaily.length}/5 claims in 24h)`,
          error_code: 'IP_DAILY_LIMIT_EXCEEDED',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Too many claims from this IP address in the last 24 hours' 
        }, { status: 429 });
      }
      
      console.log(`✅ IP VALIDATION PASSED: IP=${clientIP} (auction: ${ipClaimsThisAuction?.length || 0}/3, daily: ${ipClaimsDaily?.length || 0}/5)`);
    }
    
    // Ban check moved to after authentication to access verified usernames
    
    // For mini-app claims, acquire FID lock first to prevent same FID claiming with multiple addresses
    if (!NON_FC_CLAIM_SOURCES.includes(claim_source || '') && fid) {
      fidLockKey = `claim-fid-lock:${fid}:${auction_id}`;
      
      const fidLockAcquired = await redis.set(fidLockKey, Date.now().toString(), {
        nx: true, // Only set if not exists
        ex: 300   // Extended to 5 minutes to cover blockchain + DB operations
      });
      
      if (!fidLockAcquired) {
        console.log(`🔒 FID DUPLICATE BLOCKED: FID ${fid} already processing claim for auction ${auction_id}`);
        return NextResponse.json({ 
          success: false, 
          error: 'This Farcaster account is already processing a claim. Please wait a moment and try again.',
          code: 'FID_CLAIM_IN_PROGRESS'
        }, { status: 429 });
      }
      
      console.log(`🔓 ACQUIRED FID LOCK: FID ${fid} for auction ${auction_id}`);
    }
    
    // Create user-specific address lock to prevent concurrent duplicate claims
    lockKey = `claim-lock:${address?.toLowerCase()}:${auction_id}`;
    
    const lockAcquired = await redis.set(lockKey, Date.now().toString(), {
      nx: true, // Only set if not exists
      ex: 300   // Extended to 5 minutes to cover blockchain + DB operations
    });
    
    if (!lockAcquired) {
      console.log(`🔒 ADDRESS DUPLICATE BLOCKED: ${address} already processing claim for auction ${auction_id}`);
      return NextResponse.json({ 
        success: false, 
        error: 'A claim is already being processed for this address. Please wait a moment and try again.',
        code: 'ADDRESS_CLAIM_IN_PROGRESS'
      }, { status: 429 });
    }
    
    console.log(`🔓 ACQUIRED ADDRESS LOCK: ${address} for auction ${auction_id}`);
    
    try {
      // PRIORITY: Check duplicates immediately after acquiring locks, before expensive operations
      console.log(`🔍 EARLY DUPLICATE CHECK: Checking claims for auction ${auction_id}`);
      
      // Quick duplicate check by address first (applies to both web and mini-app)
      const { data: existingClaimByAddress, error: addressCheckError } = await supabase
        .from('link_visit_claims')
        .select('tx_hash, claimed_at, claim_source')
        .eq('eth_address', address)
        .eq('auction_id', auction_id)
        .not('claimed_at', 'is', null);
      
      if (addressCheckError) {
        console.error('Error in early address duplicate check:', addressCheckError);
        return NextResponse.json({
          success: false,
          error: 'Database error when checking claim status'
        }, { status: 500 });
      }
      
      if (existingClaimByAddress && existingClaimByAddress.length > 0) {
        const existing = existingClaimByAddress[0];
        console.log(`🚫 EARLY DUPLICATE DETECTED BY ADDRESS: ${address} already claimed for auction ${auction_id} at tx ${existing.tx_hash} (source: ${existing.claim_source})`);
        return NextResponse.json({ 
          success: false, 
          error: 'This wallet address has already claimed tokens for this auction',
          tx_hash: existing.tx_hash
        }, { status: 400 });
      }
      
      // For mini-app users, also check by FID
      if (!NON_FC_CLAIM_SOURCES.includes(claim_source || '') && fid) {
        const { data: existingClaimByFid, error: fidCheckError } = await supabase
          .from('link_visit_claims')
          .select('tx_hash, claimed_at, claim_source')
          .eq('fid', fid)
          .eq('auction_id', auction_id)
          .not('claimed_at', 'is', null);
        
        if (fidCheckError) {
          console.error('Error in early FID duplicate check:', fidCheckError);
          return NextResponse.json({
            success: false,
            error: 'Database error when checking FID claim status'
          }, { status: 500 });
        }
        
        if (existingClaimByFid && existingClaimByFid.length > 0) {
          const existing = existingClaimByFid[0];
          console.log(`🚫 EARLY DUPLICATE DETECTED BY FID: FID ${fid} already claimed for auction ${auction_id} at tx ${existing.tx_hash} (source: ${existing.claim_source})`);
          return NextResponse.json({ 
            success: false, 
            error: 'This Farcaster account has already claimed tokens for this auction',
            tx_hash: existing.tx_hash
          }, { status: 400 });
        }
      }
      
      console.log(`✅ EARLY DUPLICATE CHECK PASSED: No existing claims found for auction ${auction_id}`);
      
      // Validate required parameters based on context
      let effectiveFid: number;
      let effectiveUsername: string | null = null;
      let effectiveUserId: string | null = null; // For verified Privy userId (web users only)
      let verifiedTwitterUsername: string | null = null; // Declare here for broader scope
    
    if (NON_FC_CLAIM_SOURCES.includes(claim_source || '')) {
      // Verify auth token for web users (Twitter authentication)
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log(`🚫 WEB AUTH ERROR: IP=${clientIP}, Missing or invalid authorization header`);
        return NextResponse.json({ 
          success: false, 
          error: 'Authentication required. Please sign in with Twitter.' 
        }, { status: 401 });
      }
      
      const authToken = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Check if we have an ID token in the request headers or cookies
      // ID token is required to avoid rate limits when fetching user data
      const idToken = request.headers.get('x-privy-id-token') || 
                     request.cookies.get('privy-id-token')?.value;
      
      // Verify the Privy auth token and extract userId
      let privyUserId: string;
      try {
        // First verify the auth token
        const verifiedClaims = await privyClient.verifyAuthToken(authToken);
        
        // Check if the token is valid and user is authenticated
        if (!verifiedClaims.userId) {
          throw new Error('No user ID in token claims');
        }
        
        // Use the verified Privy userId
        privyUserId = verifiedClaims.userId;
        
        // Try to get full user data using idToken (to avoid rate limits)
        try {
          if (!idToken) {
            console.log(`🚫 WEB AUTH ERROR: IP=${clientIP}, No ID token provided - cannot verify Twitter username`);
            // NO FALLBACK - we require verified Twitter username from Privy
            verifiedTwitterUsername = null;
          } else {
            // This method verifies the token and returns the user object without rate limits
            const user = await privyClient.getUser({ idToken });
            
            // Extract Twitter username from linked accounts
            if (user && user.linkedAccounts) {
              const twitterAccount = user.linkedAccounts.find((account) => 
                account.type === 'twitter_oauth'
              );
              
              if (twitterAccount && 'username' in twitterAccount) {
                verifiedTwitterUsername = twitterAccount.username;
                console.log(`✅ WEB AUTH: IP=${clientIP}, Verified Privy User: ${privyUserId}, Twitter: @${verifiedTwitterUsername}`);
              } else {
                console.log(`⚠️ WEB AUTH: IP=${clientIP}, User ${privyUserId} has no Twitter account linked`);
                verifiedTwitterUsername = null;
              }
            } else {
              console.log(`⚠️ WEB AUTH: IP=${clientIP}, Could not retrieve user data from ID token`);
              verifiedTwitterUsername = null;
            }
          }
        } catch (getUserError) {
          console.log(`🚫 WEB AUTH ERROR: IP=${clientIP}, Failed to verify user with ID token:`, getUserError);
          // NO FALLBACK - username must be verified through Privy to prevent duplicates
          verifiedTwitterUsername = null;
        }
      } catch (error) {
        console.log(`🚫 WEB AUTH ERROR: IP=${clientIP}, Invalid auth token:`, error);
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid authentication. Please sign in again.' 
        }, { status: 401 });
      }
      
      // Web users need address and auction_id
      if (!address || !auction_id) {
        console.log(`🚫 WEB VALIDATION ERROR: IP=${clientIP}, Missing required parameters (address or auction_id). Received: address=${address}, auction_id=${auction_id}`);

        const addressHash = address?.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash?.slice(0, 8) || '0', 16);
        effectiveFid = -(hashNumber % 1000000000);
        
        await logFailedTransaction({
          fid: effectiveFid,
          eth_address: address || 'unknown',
          auction_id: auction_id || 'unknown',
          username: privyUserId, // Use verified Privy userId
          user_id: privyUserId, // For web claims, store the verified userId
          winning_url: null,
          error_message: 'Missing required parameters for web user (address or auction_id)',
          error_code: 'WEB_VALIDATION_ERROR',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ success: false, error: 'Missing required parameters (address or auction_id)' }, { status: 400 });
      }
      // NEW: Enforce username requirement for web claims
      if (!verifiedTwitterUsername) {
        console.log(`🚫 WEB USERNAME REQUIRED: IP=${clientIP}, User ${privyUserId} attempted claim without username`);
        
        const addressHash = address.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash.slice(0, 8), 16);
        effectiveFid = -(hashNumber % 1000000000);
        
        await logFailedTransaction({
          fid: effectiveFid,
          eth_address: address,
          auction_id: auction_id,
          username: null,
          user_id: privyUserId,
          winning_url: null,
          error_message: 'Username required for web claims to prevent exploitation',
          error_code: 'WEB_USERNAME_REQUIRED',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Username is required to claim $QR. Please ensure your account username is included in the request.' 
        }, { status: 400 });
      }

      // NEW: Specific ban on "anj_juan23582" username
      if (verifiedTwitterUsername.toLowerCase() === 'anj_juan23582') {
        console.log(`🚫 SPECIFIC USERNAME BAN: IP=${clientIP}, Banned username "${verifiedTwitterUsername}" attempted to claim`);
        
        const addressHash = address.slice(2).toLowerCase(); // Remove 0x and lowercase
        const hashNumber = parseInt(addressHash.slice(0, 8), 16);
        effectiveFid = -(hashNumber % 1000000000);
        
        await logFailedTransaction({
          fid: effectiveFid,
          eth_address: address,
          auction_id: auction_id,
          username: verifiedTwitterUsername,
          user_id: privyUserId,
          winning_url: null,
          error_message: `Banned username attempted claim: ${verifiedTwitterUsername}`,
          error_code: 'BANNED_USERNAME_ATTEMPT',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'This account is not eligible to claim $QR.' 
        }, { status: 403 });
      }
      
      // Create a unique negative FID from wallet address hash for web users
      const addressHash = address.slice(2).toLowerCase(); // Remove 0x and lowercase
      const hashNumber = parseInt(addressHash.slice(0, 8), 16); // Take first 8 hex chars
      effectiveFid = -(hashNumber % 1000000000); // Make it negative and limit size
      effectiveUsername = verifiedTwitterUsername; // Use verified Twitter username from Privy
      effectiveUserId = privyUserId; // 🔒 SECURITY: Use verified Privy userId for validation
      
      console.log(`🔐 SECURE WEB CLAIM: IP=${clientIP}, Verified userId=${privyUserId}, Username=@${verifiedTwitterUsername}`);
    } else {
      // Mini-app users need fid, address, auction_id, and username
      if (!fid || !address || !auction_id || !username) {
        console.log(`🚫 MINI-APP VALIDATION ERROR: IP=${clientIP}, Missing required parameters (fid, address, auction_id, or username). Received: fid=${fid}, address=${address}, auction_id=${auction_id}, username=${username}`);
        
        await logFailedTransaction({
          fid: fid || 0,
          eth_address: address || 'unknown',
          auction_id: auction_id || 'unknown',
          username: username || undefined,
          user_id: null, // Mini-app users don't have Privy userId
          winning_url: null,
          error_message: 'Missing required parameters for mini-app user (fid, address, auction_id, or username)',
          error_code: 'MINIAPP_VALIDATION_ERROR',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ success: false, error: 'Missing required parameters (fid, address, auction_id, or username)' }, { status: 400 });
      }
      
      // ENFORCE: Mini-app FIDs must be positive integers
      if (fid <= 0) {
        console.log(`🚫 MINI-APP FID ERROR: IP=${clientIP}, Invalid FID=${fid} - mini-app FIDs must be positive`);
        
        await logFailedTransaction({
          fid: fid,
          eth_address: address,
          auction_id: auction_id,
          username: username,
          user_id: null, // Mini-app users don't have Privy userId
          winning_url: null,
          error_message: `Invalid FID for mini-app user: ${fid} (must be positive)`,
          error_code: 'INVALID_MINIAPP_FID',
          request_data: { ...requestData, clientIP } as Record<string, unknown>,
          client_ip: clientIP
        });
        
        return NextResponse.json({ success: false, error: 'Invalid FID - mini-app FIDs must be positive integers' }, { status: 400 });
      }
      
      effectiveFid = fid; // Use actual fid for mini-app users (guaranteed positive)
      effectiveUsername = username; // Use actual username for mini-app users
      effectiveUserId = null; // Mini-app users don't have Privy userId
    }
    
    // CHECK BANNED USERS TABLE - applies to both web and mini-app users
    // Enhanced username checking with multiple approaches for better coverage
    console.log(`🔍 BAN CHECK: IP=${clientIP}, FID=${effectiveFid}, username=${effectiveUsername}, address=${address}`);
    
    // Check 1: By FID (only for mini-app users with real Farcaster FIDs)
    if (effectiveFid && effectiveFid > 0) {
      const { data: bannedByFid, error: fidBanError } = await supabase
        .from('banned_users')
        .select('fid, username, eth_address, reason, created_at, auto_banned, total_claims_attempted')
        .eq('fid', effectiveFid)
        .maybeSingle();
      
      if (fidBanError) {
        console.error('Error checking banned users by FID:', fidBanError);
      }
      
      if (bannedByFid) {
        console.log(`🚫 BANNED USER BLOCKED BY FID: IP=${clientIP}, FID=${effectiveFid}, banned_username=${bannedByFid.username}, reason=${bannedByFid.reason}`);
        
        // Update last attempt and increment counter
        const currentAttempts = bannedByFid.total_claims_attempted || 0;
        await supabase
          .from('banned_users')
          .update({
            last_attempt_at: new Date().toISOString(),
            total_claims_attempted: currentAttempts + 1
          })
          .eq('fid', bannedByFid.fid);
        
        // Also update IP addresses with raw SQL
        await supabase.rpc('add_ip_to_banned_user', {
          banned_fid: bannedByFid.fid,
          new_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'This account has been banned due to policy violations',
          code: 'BANNED_USER'
        }, { status: 403 });
      }
    }
    
    // Check 2: By Username (case-insensitive, with and without @ prefix)
    if (effectiveUsername) {
      const usernameVariants = [
        effectiveUsername.toLowerCase(),
        effectiveUsername.toLowerCase().replace(/^@/, ''), // Remove @ if present
        `@${effectiveUsername.toLowerCase().replace(/^@/, '')}`, // Add @ if not present
        effectiveUsername // Original case
      ];
      
      console.log(`🔍 Checking username variants: ${usernameVariants.join(', ')}`);
      
      for (const usernameVariant of usernameVariants) {
        const { data: bannedByUsername, error: usernameBanError } = await supabase
          .from('banned_users')
          .select('fid, username, eth_address, reason, created_at, auto_banned, total_claims_attempted')
          .ilike('username', usernameVariant)
          .maybeSingle();
        
        if (usernameBanError) {
          console.error(`Error checking banned users by username "${usernameVariant}":`, usernameBanError);
          continue;
        }
        
        if (bannedByUsername) {
          console.log(`🚫 BANNED USER BLOCKED BY USERNAME: IP=${clientIP}, username=${effectiveUsername}, banned_as=${bannedByUsername.username}, FID=${bannedByUsername.fid}, reason=${bannedByUsername.reason}`);
          
          // Update last attempt and increment counter
          const currentAttempts = bannedByUsername.total_claims_attempted || 0;
          await supabase
            .from('banned_users')
            .update({
              last_attempt_at: new Date().toISOString(),
              total_claims_attempted: currentAttempts + 1
            })
            .eq('fid', bannedByUsername.fid);
          
          // Also update IP addresses with raw SQL
          await supabase.rpc('add_ip_to_banned_user', {
            banned_fid: bannedByUsername.fid,
            new_ip: clientIP
          });
          
          return NextResponse.json({ 
            success: false, 
            error: 'This account has been banned due to policy violations',
            code: 'BANNED_USER'
          }, { status: 403 });
        }
      }
    }
    
    // Check 3: By ETH Address (case-insensitive)
    if (address) {
      const { data: bannedByAddress, error: addressBanError } = await supabase
        .from('banned_users')
        .select('fid, username, eth_address, reason, created_at, auto_banned, total_claims_attempted')
        .ilike('eth_address', address)
        .maybeSingle();
      
      if (addressBanError) {
        console.error('Error checking banned users by address:', addressBanError);
      }
      
      if (bannedByAddress) {
        console.log(`🚫 BANNED USER BLOCKED BY ADDRESS: IP=${clientIP}, address=${address}, banned_username=${bannedByAddress.username}, FID=${bannedByAddress.fid}, reason=${bannedByAddress.reason}`);
        
        // Update last attempt and increment counter
        const currentAttempts = bannedByAddress.total_claims_attempted || 0;
        await supabase
          .from('banned_users')
          .update({
            last_attempt_at: new Date().toISOString(),
            total_claims_attempted: currentAttempts + 1
          })
          .eq('fid', bannedByAddress.fid);
        
        // Also update IP addresses with raw SQL
        await supabase.rpc('add_ip_to_banned_user', {
          banned_fid: bannedByAddress.fid,
          new_ip: clientIP
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'This account has been banned due to policy violations',
          code: 'BANNED_USER'
        }, { status: 403 });
      }
    }
    
    console.log(`✅ BAN CHECK PASSED: IP=${clientIP}, FID=${effectiveFid}, username=${effectiveUsername}, address=${address} - No bans found`);
    
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
    if (!NON_FC_CLAIM_SOURCES.includes(claim_source || '')) {
      console.log(`🔍 MINI-APP VALIDATION: IP=${clientIP}, FID=${effectiveFid}, username=${effectiveUsername}, address=${address} - validating via miniapp-validation.ts`);
      
      const userValidation = await validateMiniAppUser(effectiveFid, effectiveUsername || undefined, address);
      if (!userValidation.isValid) {
        console.log(`🚫 MINI-APP VALIDATION FAILED: IP=${clientIP}, FID=${effectiveFid}, username=${effectiveUsername}, address=${address} - Error: ${userValidation.error}`);
        
        // Don't queue failed transactions for validation errors - just return error
        // These are user errors, not system failures that need retry
        return NextResponse.json({ 
          success: false, 
          error: userValidation.error || 'Invalid user or spoofed request' 
        }, { status: 400 });
      }
      
      console.log(`✅ MINI-APP VALIDATION PASSED: IP=${clientIP}, FID=${effectiveFid}, username=${effectiveUsername}, address=${address} - Address verified for this Farcaster account`);
    }
    
    // Clean up any incomplete claims (no tx_hash) for this FID/address/user to allow retry
    console.log(`🧹 CLEANUP: Removing any incomplete claims for auction ${auction_id}`);
    
    // Clean up incomplete claims by address
    const { error: cleanupAddressError } = await supabase
      .from('link_visit_claims')
      .delete()
      .eq('eth_address', address)
      .eq('auction_id', auction_id)
      .is('tx_hash', null);
    
    if (cleanupAddressError) {
      console.warn('Error cleaning up incomplete address claims:', cleanupAddressError);
    }
    
    // Clean up incomplete claims by FID (mini-app only)
    if (!NON_FC_CLAIM_SOURCES.includes(claim_source || '') && fid) {
      const { error: cleanupFidError } = await supabase
        .from('link_visit_claims')
        .delete()
        .eq('fid', fid)
        .eq('auction_id', auction_id)
        .is('tx_hash', null);
      
      if (cleanupFidError) {
        console.warn('Error cleaning up incomplete FID claims:', cleanupFidError);
      }
    }
    
    // Clean up incomplete claims by user (if applicable)
    if (effectiveUserId || effectiveUsername) {
      const checkField = effectiveUserId ? 'user_id' : 'username';
      const checkValue = effectiveUserId || effectiveUsername;
      
      const { error: cleanupUserError } = await supabase
        .from('link_visit_claims')
        .delete()
        .eq(checkField, checkValue)
        .eq('auction_id', auction_id)
        .is('tx_hash', null);
      
      if (cleanupUserError) {
        console.warn(`Error cleaning up incomplete ${checkField} claims:`, cleanupUserError);
      }
    }
    
    console.log(`✅ CLEANUP COMPLETE: Ready to proceed with new claim`);
    
    // Initialize ethers provider and get wallet from pool
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    walletPool = getWalletPool(provider);
    
    let adminWallet: ethers.Wallet;
    let DYNAMIC_AIRDROP_CONTRACT: string;
    
    // Determine the purpose based on claim source
    let walletPurpose: 'link-web' | 'mobile-link-visit' | 'link-miniapp';
    if (claim_source === 'mobile') {
      walletPurpose = 'mobile-link-visit';
    } else if (claim_source === 'web') {
      walletPurpose = 'link-web';
    } else {
      walletPurpose = 'link-miniapp';
    }
    
    // Check if we should use direct wallet (pool disabled for this purpose)
    const directWallet = walletPool.getDirectWallet(walletPurpose);
    
    if (directWallet) {
      // Use direct wallet without pool logic
      console.log(`Using direct wallet ${directWallet.wallet.address} (pool disabled for ${walletPurpose})`);
      adminWallet = directWallet.wallet;
      DYNAMIC_AIRDROP_CONTRACT = directWallet.airdropContract;
    } else {
      // Use wallet pool
      try {
        walletConfig = await walletPool.getAvailableWallet(walletPurpose);
        console.log(`Using wallet ${walletConfig.wallet.address} with contract ${walletConfig.airdropContract} for ${claim_source}`);
        adminWallet = walletConfig.wallet;
        DYNAMIC_AIRDROP_CONTRACT = walletConfig.airdropContract;
      } catch (poolError) {
        const errorMessage = 'All wallets are currently busy. Please try again in a moment.';
        console.error('Failed to get wallet from pool:', poolError);
        
        await logFailedTransaction({
          fid: effectiveFid,
          eth_address: address,
          auction_id,
          username: effectiveUsername,
          user_id: effectiveUserId,
          winning_url: winningUrl,
          error_message: errorMessage,
          error_code: 'WALLET_POOL_BUSY',
          request_data: requestData as Record<string, unknown>,
          network_status: 'pool_busy',
          client_ip: clientIP
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
          fid: effectiveFid,
          eth_address: address,
          auction_id,
          username: effectiveUsername,
          user_id: effectiveUserId,
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
    
    // Define airdrop amount based on claim source
    // Web users get 500 QR, mini app users get 1000 QR
    // Assuming 18 decimals for the QR token
    const claimAmount = NON_FC_CLAIM_SOURCES.includes(claim_source || '') ? '500' : '1000';
    const airdropAmount = ethers.parseUnits(claimAmount, 18);
    
    console.log(`Preparing airdrop of ${claimAmount} QR tokens to ${address}`);
    
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
          fid: effectiveFid,
          eth_address: address,
          auction_id,
          username: effectiveUsername,
          user_id: effectiveUserId,
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
          
          // Add timeout wrapper around the wait to prevent Vercel timeouts
          const approvalPromise = approveTx.wait();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Approval transaction timeout after 45 seconds')), 45000)
          );
          
          try {
            await Promise.race([approvalPromise, timeoutPromise]);
            console.log('Approval confirmed');
          } catch (raceError) {
            // Handle the race error properly
            const errorMessage = raceError instanceof Error 
              ? raceError.message 
              : 'Unknown approval error';
              
            const txHash = approveTx.hash;
            
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
                    user_id: effectiveUserId,
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
                throw raceError;
              }
            } else {
              // Not a timeout error, throw it to be handled by outer catch
              throw raceError;
            }
          }
        } catch (approveError: unknown) {
          console.error('Error approving tokens:', approveError);
          
          const errorMessage = approveError instanceof Error 
            ? approveError.message 
            : 'Unknown approval error';
            
          const txHash = (approveError as { hash?: string }).hash;
          
          // Normal error handling for non-timeout errors
          if (!errorMessage.includes('timeout')) {
            // Log token approval error
            await logFailedTransaction({
              fid: effectiveFid,
              eth_address: address,
              auction_id,
              username: effectiveUsername,
              user_id: effectiveUserId,
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
        user_id: effectiveUserId,
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
    let submittedTxHash: string | undefined;
    
    try {
      // Wrap the transaction in the retry function with tx hash tracking
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
          submittedTxHash = tx.hash; // Store the hash
          
          // Add timeout wrapper around the wait to prevent Vercel timeouts
          // Reduced timeout to 45 seconds to leave room for database operations
          const airdropPromise = tx.wait();
          const timeoutPromise = new Promise((_, reject) => {
            const timeoutError = new Error('Airdrop transaction timeout after 45 seconds');
            (timeoutError as { hash?: string }).hash = tx.hash; // Attach hash to error
            setTimeout(() => reject(timeoutError), 45000);
          });
          
          const receipt = await Promise.race([airdropPromise, timeoutPromise]) as Awaited<ReturnType<typeof airdropContract.airdropERC20>>;
          console.log(`Airdrop confirmed in block ${receipt.blockNumber}`);
          
          return receipt;
        } catch (txError: unknown) {
          // Log transaction error details for each attempt
          console.error(`Transaction attempt ${attempt} failed:`, txError);
          
          const txErrorMessage = txError instanceof Error 
            ? txError.message 
            : 'Unknown transaction error';
          
          const errorCode = (txError as { code?: string }).code;
          const txHash = submittedTxHash || (txError as { hash?: string }).hash;
          
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
              user_id: effectiveUserId,
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
      }, 2, 1000, (hash) => {
        submittedTxHash = hash; // Update the hash if provided by callback
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
          amount: parseInt(claimAmount), // 500 or 1000 QR tokens based on source
          tx_hash: receipt.hash,
          success: true,
          username: effectiveUsername, // Display username (from request for mini-app, null for web)
          user_id: effectiveUserId, // Verified Privy userId (for web users only, null for mini-app)
          winning_url: winningUrl,
          claim_source: claim_source || 'mini_app',
          client_ip: clientIP // Track IP for successful claims
        });
        
      if (insertError) {
        // If insert fails due to duplicate key, another concurrent request succeeded
        console.error('Error inserting claim record, trying update:', insertError);
        
        // Check if it's a duplicate key error
        if (insertError.code === '23505' || insertError.message.includes('duplicate key')) {
          // CRITICAL: This means another transaction already claimed!
          // The blockchain transaction succeeded but someone else recorded the claim first
          console.log(`⚠️ DUPLICATE CLAIM DETECTED: Transaction ${receipt.hash} succeeded but claim already exists`);
          
          // Try to fetch the existing claim to see who got there first
          const { data: existingClaim } = await supabase
            .from('link_visit_claims')
            .select('tx_hash, claimed_at, eth_address, fid')
            .eq('fid', effectiveFid)
            .eq('auction_id', auction_id)
            .single();
          
          if (existingClaim) {
            console.log(`⚠️ DUPLICATE TX: Original claim tx: ${existingClaim.tx_hash}, Duplicate tx: ${receipt.hash}`);
            
            // AUTO-BAN: This is PROOF they got multiple blockchain transactions through!
            console.log(`🚨 AUTO-BAN TRIGGERED: Multiple successful blockchain transactions detected!`);
            console.log(`🚨 FID ${effectiveFid} got at least 2 transactions: ${existingClaim.tx_hash} and ${receipt.hash}`);
            
            try {
              // Record this duplicate transaction attempt for evidence
              const duplicateTxs = [existingClaim.tx_hash, receipt.hash];
              
              // Ban this user immediately - they successfully exploited the race condition
              const { error: banError } = await supabase
                .from('banned_users')
                .insert({
                  fid: effectiveFid,
                  username: effectiveUsername,
                  eth_address: address,
                  reason: `Auto-banned: Exploited race condition - got ${duplicateTxs.length} blockchain transactions for auction ${auction_id}`,
                  created_at: new Date().toISOString(),
                  banned_by: 'race_condition_detector',
                  auto_banned: true,
                  total_claims_attempted: duplicateTxs.length, // Only count the duplicate transactions for THIS auction
                  duplicate_transactions: duplicateTxs,
                  total_tokens_received: duplicateTxs.length * 1000,
                  ban_metadata: {
                    trigger: 'duplicate_blockchain_tx_detected',
                    auction_id: auction_id,
                    recorded_tx: existingClaim.tx_hash,
                    duplicate_tx: receipt.hash,
                    duplicate_tx_timestamp: new Date().toISOString(),
                    exploit_type: 'race_condition',
                    exploited_auction: auction_id,
                    duplicate_count: duplicateTxs.length,
                    note: `User successfully executed ${duplicateTxs.length} blockchain transactions for auction ${auction_id} before database lock`
                  }
                })
                .select();
              
              if (banError && banError.code !== '23505') { // Ignore if already banned
                console.error('Error auto-banning user:', banError);
              } else {
                console.log(`✅ User FID ${effectiveFid} banned for exploiting race condition`);
              }
            } catch (banError) {
              console.error('Error in auto-ban process:', banError);
            }
          }
          
          // Still return success since the blockchain transaction went through
          // but flag it as a duplicate for monitoring
          return NextResponse.json({ 
            success: true, 
            warning: 'Transaction successful but claim was already recorded',
            tx_hash: receipt.hash,
            is_duplicate: true,
            original_tx: existingClaim?.tx_hash
          });
        }
        
        // For other errors, try update as fallback
        const { error: updateError } = await supabase
          .from('link_visit_claims')
          .update({
            eth_address: address,
            claimed_at: new Date().toISOString(),
            amount: parseInt(claimAmount), // 500 or 1000 QR tokens based on source
            tx_hash: receipt.hash,
            success: true,
            username: effectiveUsername, // Display username (from request for mini-app, null for web)
            user_id: effectiveUserId, // Verified Privy userId (for web users only, null for mini-app)
            winning_url: winningUrl,
            claim_source: claim_source || 'mini_app',
            client_ip: clientIP // Track IP for successful claims
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
            user_id: effectiveUserId,
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
      
      // REMOVED: Overly aggressive auto-ban check that was banning legitimate users
      // Auto-ban only happens when we detect actual exploitation (duplicate blockchain transactions)
      
      // NEW AUTO-BAN CHECK: Web users claiming with same username but different addresses FOR THE SAME AUCTION
      if (NON_FC_CLAIM_SOURCES.includes(claim_source || '') && effectiveUsername) {
        console.log(`🔍 Checking for multiple claims by username: ${effectiveUsername} for auction ${auction_id}`);
        
        // Check how many successful claims this username has made for THIS SPECIFIC AUCTION
        const { data: usernameClaimsData, error: usernameClaimsError } = await supabase
          .from('link_visit_claims')
          .select('id, eth_address, auction_id, claimed_at, tx_hash')
          .eq('username', effectiveUsername)
          .eq('auction_id', auction_id) // Only check current auction
          .in('claim_source', NON_FC_CLAIM_SOURCES)
          .not('tx_hash', 'is', null)
          .not('claimed_at', 'is', null)
          .order('claimed_at', { ascending: false });
        
        if (usernameClaimsError) {
          console.error('Error checking username claims for auto-ban:', usernameClaimsError);
        } else if (usernameClaimsData && usernameClaimsData.length >= 2) {
          // Check if this is a 3rd+ claim with a DIFFERENT address for the same auction
          const uniqueAddresses = new Set(usernameClaimsData.map(claim => claim.eth_address.toLowerCase()));
          uniqueAddresses.add(address.toLowerCase()); // Add current address
          
          if (uniqueAddresses.size > 2) {
            console.log(`🚨 AUTO-BAN TRIGGERED: Username "${effectiveUsername}" attempting ${uniqueAddresses.size}rd unique address claim for auction ${auction_id}`);
            console.log(`🚨 Previous addresses used: ${Array.from(uniqueAddresses).slice(0, -1).join(', ')}`);
            console.log(`🚨 Attempting new address: ${address}`);
            
            try {
              // Ban this user immediately for exploiting multiple addresses on same auction
              const { error: banError } = await supabase
                .from('banned_users')
                .insert({
                  fid: effectiveFid,
                  username: effectiveUsername,
                  eth_address: address,
                  reason: `Auto-banned: Web user claimed auction ${auction_id} with ${uniqueAddresses.size} different addresses (limit: 2)`,
                  created_at: new Date().toISOString(),
                  banned_by: 'multi_address_detector',
                  auto_banned: true,
                  total_claims_attempted: usernameClaimsData.length + 1,
                  duplicate_transactions: usernameClaimsData.map(c => c.tx_hash),
                  total_tokens_received: usernameClaimsData.length * 1000, // Only count successful claims
                  ban_metadata: {
                    trigger: 'multiple_addresses_same_username_same_auction',
                    auction_id: auction_id,
                    unique_addresses: Array.from(uniqueAddresses),
                    address_count: uniqueAddresses.size,
                    successful_claims: usernameClaimsData.map(c => ({
                      address: c.eth_address,
                      claimed_at: c.claimed_at,
                      tx_hash: c.tx_hash
                    })),
                    attempted_address: address,
                    note: `Web user "${effectiveUsername}" exploited auction ${auction_id} by claiming with ${uniqueAddresses.size} different addresses`
                  }
                })
                .select();
              
              if (banError && banError.code !== '23505') { // Ignore if already banned
                console.error('Error auto-banning user for multiple addresses:', banError);
              } else {
                console.log(`✅ User "${effectiveUsername}" banned for using ${uniqueAddresses.size} different addresses on auction ${auction_id}`);
                
                // Return error to block this claim
                return NextResponse.json({ 
                  success: false, 
                  error: 'This account has been banned for violating usage policies',
                  code: 'AUTO_BANNED_MULTIPLE_ADDRESSES'
                }, { status: 403 });
              }
            } catch (banError) {
              console.error('Error in auto-ban process:', banError);
              // Still block the claim even if ban insertion fails
              return NextResponse.json({ 
                success: false, 
                error: 'Account suspended for policy violations',
                code: 'MULTIPLE_ADDRESS_VIOLATION'
              }, { status: 403 });
            }
          } else {
            console.log(`✅ Username "${effectiveUsername}" has ${usernameClaimsData.length} claims for auction ${auction_id} with ${uniqueAddresses.size} unique addresses (within limit)`);
          }
        }
      }
      
      // CRITICAL: Release locks ONLY after successful database insert
      // This prevents other requests from proceeding until the claim is recorded
      if (lockKey) {
        try {
          await redis.del(lockKey);
          console.log(`🔓 RELEASED ADDRESS LOCK (after DB): ${lockKey}`);
        } catch (lockError) {
          console.error('Error releasing address lock:', lockError);
        }
      }
      
      if (fidLockKey) {
        try {
          await redis.del(fidLockKey);
          console.log(`🔓 RELEASED FID LOCK (after DB): ${fidLockKey}`);
        } catch (lockError) {
          console.error('Error releasing FID lock:', lockError);
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
        user_id: effectiveUserId,
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
    } finally {
      // Release the wallet lock if using pool
      if (walletConfig && walletConfig.lockKey && walletPool) {
        await walletPool.releaseWallet(walletConfig.lockKey);
        console.log(`Released wallet lock for ${walletConfig.wallet.address}`);
      }
    }
    
    } catch (walletError: unknown) {
      console.error('Wallet operation error:', walletError);
      
      const errorMessage = walletError instanceof Error 
        ? walletError.message 
        : 'Unknown wallet operation error';
      
      // Log wallet operation error
      await logFailedTransaction({
        fid: effectiveFid,
        eth_address: address,
        auction_id,
        username: effectiveUsername,
        user_id: effectiveUserId,
        winning_url: winningUrl,
        error_message: `Wallet operation failed: ${errorMessage}`,
        error_code: 'WALLET_OPERATION_ERROR',
        request_data: requestData as Record<string, unknown>,
        network_status: 'wallet_error',
        client_ip: clientIP
      });
      
      return NextResponse.json({ 
        success: false, 
        error: 'Wallet operation failed. Please try again later.' 
      }, { status: 500 });
    }
    
    } catch (innerError: unknown) {
      console.error('Inner try block error:', innerError);
      throw innerError; // Re-throw to be handled by outer catch
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
    const fidForLog = typeof requestData.fid === 'number' ? requestData.fid : (NON_FC_CLAIM_SOURCES.includes(requestData.claim_source || '') ? -1 : 0);
    const addressForLog = typeof requestData.address === 'string' ? requestData.address : 'unknown';
    const auctionIdForLog = typeof requestData.auction_id === 'string' ? requestData.auction_id : 'unknown';
    const usernameForLog = NON_FC_CLAIM_SOURCES.includes(requestData.claim_source || '') ? null : requestData.username;
    const winningUrlForLog = requestData.winning_url;
    
    // Attempt to log error even in case of unexpected errors
    try {
      await logFailedTransaction({
        fid: fidForLog,
        eth_address: addressForLog,
        auction_id: auctionIdForLog,
        username: usernameForLog || null,
        user_id: null, // IP limit failures don't have user context
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
  } finally {
    // Locks are now released after successful DB insert in the main flow
    // Only release here if we're returning early due to an error
    // Check if locks still exist (not already released in success path)
    if (lockKey) {
      try {
        const lockExists = await redis.exists(lockKey);
        if (lockExists) {
          await redis.del(lockKey);
          console.log(`🔓 RELEASED ADDRESS LOCK (error path): ${lockKey}`);
        }
      } catch (lockError) {
        console.error('Error releasing address lock:', lockError);
      }
    }
    
    if (fidLockKey) {
      try {
        const lockExists = await redis.exists(fidLockKey);
        if (lockExists) {
          await redis.del(fidLockKey);
          console.log(`🔓 RELEASED FID LOCK (error path): ${fidLockKey}`);
        }
      } catch (lockError) {
        console.error('Error releasing FID lock:', lockError);
      }
    }
  }
}
