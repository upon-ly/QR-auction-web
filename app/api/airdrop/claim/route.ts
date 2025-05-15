import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';
const AIRDROP_CONTRACT_ADDRESS = process.env.AIRDROP_CONTRACT_ADDRESS || '';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';

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
  username?: string | null;
  error_message: string;
  error_code?: string;
  tx_hash?: string;
  request_data?: Record<string, unknown>;
  gas_price?: string;
  gas_limit?: number;
  network_status?: string;
  retry_count?: number;
}) {
  try {
    const { error } = await supabase
      .from('airdrop_claim_failures')
      .insert({
        fid: params.fid,
        eth_address: params.eth_address,
        username: params.username || null,
        error_message: params.error_message,
        error_code: params.error_code || null,
        tx_hash: params.tx_hash || null,
        request_data: params.request_data ? JSON.stringify(params.request_data) : null,
        gas_price: params.gas_price || null,
        gas_limit: params.gas_limit || null,
        network_status: params.network_status || null,
        retry_count: params.retry_count || 0
      });

    if (error) {
      console.error('Failed to log error to database:', error);
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

  try {
    // Parse request body
    requestData = await request.json() as AirdropRequestData;
    ({ fid, address, hasNotifications, username } = requestData);
    
    if (!fid || !address) {
      const errorMessage = 'Missing fid or address';
      
      // Log validation error
      await logFailedTransaction({
        fid: fid !== undefined ? fid : 0,
        eth_address: address !== undefined ? address : 'unknown',
        username,
        error_message: errorMessage,
        error_code: 'VALIDATION_ERROR',
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }
    
    // Log request for debugging
    console.log(`Airdrop claim request: FID=${fid}, address=${address}, username=${username || 'unknown'}, hasNotifications=${hasNotifications}`);
    
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
    
    // Check if user has already claimed
    const { data: claimData, error: selectError } = await supabase
      .from('airdrop_claims')
      .select('*')
      .eq('fid', fid)
      .single();
    
    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status:', selectError);
      
      // Log database error
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: 'Database error when checking claim status',
        error_code: selectError.code,
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
      
    if (claimData) {
      console.log(`User ${fid} has already claimed at tx ${claimData.tx_hash}`);
      
      // Log duplicate claim attempt
      await logFailedTransaction({
        fid: fid as number,
        eth_address: address as string,
        username,
        error_message: 'User has already claimed the airdrop',
        error_code: 'DUPLICATE_CLAIM',
        tx_hash: claimData.tx_hash,
        request_data: requestData as Record<string, unknown>
      });
      
      return NextResponse.json({ 
        success: false, 
        error: 'User has already claimed the airdrop',
        tx_hash: claimData.tx_hash
      }, { status: 400 });
    }
    
    // Initialize ethers provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    
    // Check wallet balance before proceeding
    const balance = await provider.getBalance(adminWallet.address);
    console.log(`Admin wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther("0.001")) {
      const errorMessage = 'Admin wallet has insufficient ETH for gas. Please contact support.';
      console.error("Admin wallet has insufficient ETH for gas");
      
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
    const airdropAmount = ethers.parseUnits('2000', 18);
    
    console.log(`Preparing airdrop of 2,000 QR tokens to ${address}`);
    
    // Create contract instances
    const airdropContract = new ethers.Contract(
      AIRDROP_CONTRACT_ADDRESS,
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
      
      const allowance = await qrTokenContract.allowance(adminWallet.address, AIRDROP_CONTRACT_ADDRESS);
      console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
      
      if (allowance < airdropAmount) {
        console.log('Approving tokens for transfer...');
        
        try {
          // Approve the airdrop contract to spend the tokens
          const approveTx = await qrTokenContract.approve(
            AIRDROP_CONTRACT_ADDRESS,
            airdropAmount
          );
          
          console.log(`Approval tx submitted: ${approveTx.hash}`);
          await approveTx.wait();
          console.log('Approval confirmed');
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
          const receipt = await tx.wait();
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
          amount: 2000, // 2,000 QR tokens
          tx_hash: receipt.hash,
          success: true,
          username: username || null
        });
        
      if (insertError) {
        console.error('Error recording claim:', insertError);
        
        // Log database insert error, but the airdrop was successful
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
        username: username || null,
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
