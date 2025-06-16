import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PrivyClient } from '@privy-io/server-auth'
import { ethers } from 'ethers'
import AirdropABI from '@/abi/Airdrop.json'
import { redis } from '@/lib/queue/failedClaims'

// Initialize Privy client for server-side authentication
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  process.env.PRIVY_APP_SECRET || ''
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
      
      // Wait with exponential backoff
      await delay(initialDelayMs * 2 ** attempt);
      attempt++;
    }
  }
  
  throw lastError;
}

export async function POST(request: NextRequest) {
    let lockKey: string | undefined;

    try {
        const body = await request.json()
        let { privyId, authToken } = body
        const { address } = body

        // Check for auth token in header if not in body
        if (!authToken) {
            const authHeader = request.headers.get('authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                authToken = authHeader.substring(7); // Remove 'Bearer ' prefix
            }
        }

        // Verify auth token is provided
        if (!authToken) {
            return NextResponse.json({ 
                error: 'Authentication required. Please provide auth token.' 
            }, { status: 401 });
        }

        // Verify the Privy auth token and extract userId
        let verifiedPrivyId: string;
        try {
            const verifiedClaims = await privyClient.verifyAuthToken(authToken);
            
            if (!verifiedClaims.userId) {
                throw new Error('No user ID in token claims');
            }
            
            verifiedPrivyId = verifiedClaims.userId;
            console.log(`✅ WELCOME CLAIM AUTH: Verified Privy User: ${verifiedPrivyId}`);
            
            // If privyId was provided in body, verify it matches the token
            if (privyId && privyId !== verifiedPrivyId) {
                console.log(`🚫 PRIVY ID MISMATCH: Body=${privyId}, Token=${verifiedPrivyId}`);
                return NextResponse.json({ 
                    error: 'Privy ID mismatch with auth token' 
                }, { status: 400 });
            }
            
            // Use the verified privy ID from the token
            privyId = verifiedPrivyId;
            
        } catch (error) {
            console.log(`🚫 WELCOME CLAIM AUTH ERROR: Invalid auth token:`, error);
            return NextResponse.json({ 
                error: 'Invalid authentication. Please sign in again.' 
            }, { status: 401 });
        }

        // Require address for welcome claims
        if (!address) {
            return NextResponse.json({ 
                error: 'Wallet address is required for welcome claims' 
            }, { status: 400 });
        }

        // Create claim-specific lock to prevent concurrent claims
        lockKey = `welcome-claim-lock:${privyId}`;
        
        const lockAcquired = await redis.set(lockKey, Date.now().toString(), {
            nx: true, // Only set if not exists
            ex: 60    // Expire in 60 seconds
        });
        
        if (!lockAcquired) {
            console.log(`🔒 DUPLICATE WELCOME CLAIM BLOCKED: ${privyId} already processing`);
            return NextResponse.json({ 
                success: false, 
                error: 'A welcome claim is already being processed. Please wait a moment.',
                code: 'CLAIM_IN_PROGRESS'
            }, { status: 429 });
        }

        console.log(`🔓 ACQUIRED WELCOME CLAIM LOCK: ${privyId}`);

        // search supabase `welcome_claims` table for privyId or address
        const { data, error } = await supabase
            .from('welcome_claims')
            .select('*')
            .or(`privy_id.eq.${privyId},eth_address.eq.${address}`)
        if (error) {
            // RLS or other errors
            return NextResponse.json({ error: 'SUPABASE_ERROR', details: error.message }, { status: 500 })
        }

        // if a record is found, return {error: 'ALREADY_CLAIMED'}
        if (data.length > 0) {
            const existingClaim = data[0];
            let reason = 'ALREADY_CLAIMED';
            
            if (existingClaim.privy_id === privyId && existingClaim.eth_address === address) {
                reason = 'ALREADY_CLAIMED_SAME_USER_AND_ADDRESS';
            } else if (existingClaim.privy_id === privyId) {
                reason = 'ALREADY_CLAIMED_SAME_USER';
            } else if (existingClaim.eth_address === address) {
                reason = 'ALREADY_CLAIMED_SAME_ADDRESS';
            }
            
            return NextResponse.json({ error: reason }, { status: 400 })
        }

        // Get wallet and contract for welcome claims (use dedicated wallet 5)
        const WELCOME_ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY5;
        const WELCOME_AIRDROP_CONTRACT = process.env.AIRDROP_CONTRACT_ADDRESS5;
        
        if (!WELCOME_ADMIN_PRIVATE_KEY || !WELCOME_AIRDROP_CONTRACT) {
            throw new Error('Welcome claim wallet configuration missing');
        }

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const adminWallet = new ethers.Wallet(WELCOME_ADMIN_PRIVATE_KEY, provider);
        
        console.log(`Using wallet ${adminWallet.address} for welcome claim`);

        // Check wallet balance before proceeding
        const balance = await provider.getBalance(adminWallet.address);
        console.log(`Wallet ${adminWallet.address} balance: ${ethers.formatEther(balance)} ETH`);
        
        if (balance < ethers.parseEther("0.001")) {
            const errorMessage = 'Admin wallet has insufficient ETH for gas. Please contact support.';
            console.error(`Wallet ${adminWallet.address} has insufficient ETH for gas`);
            
            return NextResponse.json({ 
                success: false, 
                error: errorMessage
            }, { status: 500 });
        }

        // Define airdrop amount (1,000 QR tokens)
        const airdropAmount = ethers.parseUnits('1000', 18);
        
        console.log(`Preparing welcome airdrop of 1,000 QR tokens to ${address}`);

        // Create contract instances
        const airdropContract = new ethers.Contract(
            WELCOME_AIRDROP_CONTRACT,
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
                const errorMessage = 'Admin wallet has insufficient QR tokens for welcome airdrop. Please contact support.';
                console.error("Admin wallet has insufficient QR tokens for welcome airdrop");
                
                return NextResponse.json({ 
                    success: false, 
                    error: errorMessage
                }, { status: 500 });
            }
            
            const allowance = await qrTokenContract.allowance(adminWallet.address, WELCOME_AIRDROP_CONTRACT);
            console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
            
            if (allowance < airdropAmount) {
                console.log('Approving tokens for transfer...');
                
                try {
                    // Approve the airdrop contract to spend the tokens
                    const approveTx = await qrTokenContract.approve(
                        WELCOME_AIRDROP_CONTRACT,
                        airdropAmount
                    );
                    
                    console.log(`Approval tx submitted: ${approveTx.hash}`);
                    
                    // Add timeout wrapper to prevent Vercel timeout
                    const approvalPromise = approveTx.wait();
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Approval transaction timeout after 55 seconds')), 55000)
                    );
                    
                    try {
                        await Promise.race([approvalPromise, timeoutPromise]);
                        console.log('Approval confirmed');
                    } catch (raceError) {
                        if (raceError instanceof Error && raceError.message.includes('timeout')) {
                            console.log('Approval timed out, will proceed with airdrop attempt');
                        } else {
                            throw raceError;
                        }
                    }
                } catch (error) {
                    console.error('Error approving tokens:', error);
                    throw error;
                }
            }
        } catch (error: unknown) {
            console.error('Error checking token balance or approving tokens:', error);
            
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'Unknown error checking token balance';
            
            return NextResponse.json({ 
                success: false, 
                error: errorMessage
            }, { status: 500 });
        }

        // Prepare airdrop content
        const airdropContent = [{
            recipient: address,
            amount: airdropAmount
        }];
        
        console.log('Executing welcome airdrop...');
        
        // Execute the airdrop with retry logic
        const receipt = await executeWithRetry(async (attempt) => {
            // Get fresh nonce each time
            const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
            console.log(`Using nonce: ${nonce} for welcome airdrop, attempt: ${attempt}`);
            
            // Increase gas price with each retry attempt
            const gasPrice = await provider.getFeeData().then(feeData => 
                feeData.gasPrice ? feeData.gasPrice * BigInt(130 + attempt * 20) / BigInt(100) : undefined
            );
            
            const gasLimit = 5000000; // Higher gas limit for safety
            
            try {
                // Execute the airdrop
                const tx = await airdropContract.airdropERC20(
                    QR_TOKEN_ADDRESS,
                    airdropContent,
                    {
                        nonce,
                        gasLimit,
                        gasPrice
                    }
                );
                
                console.log(`Welcome airdrop tx submitted: ${tx.hash}`);
                
                // Add timeout wrapper
                const airdropPromise = tx.wait();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Airdrop transaction timeout after 55 seconds')), 55000)
                );
                
                const receipt = await Promise.race([airdropPromise, timeoutPromise]) as Awaited<ReturnType<typeof airdropContract.airdropERC20>>;
                console.log(`Welcome airdrop confirmed in block ${receipt.blockNumber}`);
                
                return receipt;
            } catch (error) {
                console.error(`Welcome airdrop attempt ${attempt + 1} failed:`, error);
                throw error;
            }
        });

        // if no record is found, create a new record with transaction details
        const { error: newError } = await supabase
            .from('welcome_claims')
            .insert({ 
                privy_id: privyId,
                eth_address: address,
                tx_hash: receipt.hash
            })
        if (newError) {
            console.error('Error recording welcome claim:', newError);
            
            return NextResponse.json({ 
                success: true, 
                warning: 'Airdrop successful but failed to record claim',
                tx_hash: receipt.hash
            });
        }

        return NextResponse.json({ 
            success: true,
            message: 'Welcome tokens claimed successfully',
            tx_hash: receipt.hash
        }, { status: 200 })
    } catch (error) {
        console.error('Welcome claim error:', error);
        
        // Try to provide more specific error messages
        let errorMessage = 'Failed to process welcome claim';
        
        if (error instanceof Error) {
            if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds in admin wallet for gas';
            } else if (error.message.includes('execution reverted')) {
                errorMessage = 'Contract execution reverted: ' + (error.message.split('execution reverted:')[1]?.trim() || 'unknown reason');
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Transaction timeout - please try again';
            } else {
                errorMessage = error.message;
            }
        }
        
        return NextResponse.json({ 
            error: errorMessage
        }, { status: 500 });
    } finally {
        // Release the claim lock
        if (lockKey) {
            try {
                await redis.del(lockKey);
                console.log(`🔓 RELEASED WELCOME CLAIM LOCK: ${lockKey}`);
            } catch (lockError) {
                console.error('Error releasing welcome claim lock:', lockError);
            }
        }
    }
} 
