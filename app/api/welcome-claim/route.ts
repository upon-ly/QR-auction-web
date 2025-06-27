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
    let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;

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

        // Check eligibility directly against welcome_claims table
        console.log(`🔍 CHECKING WELCOME CLAIM ELIGIBILITY: privyId=${privyId}, address=${address}`);

        // Check if this privyId or address has already claimed welcome tokens
        const { data: existingClaims, error: checkError } = await supabase
            .from('welcome_claims')
            .select('*')
            .or(`privy_id.eq.${privyId},eth_address.eq.${address}`);

        if (checkError) {
            console.error('Error checking welcome claim eligibility:', checkError);
            return NextResponse.json({ 
                error: 'Database error checking eligibility' 
            }, { status: 500 });
        }

        if (existingClaims && existingClaims.length > 0) {
            const claim = existingClaims[0];
            let errorCode: string;
            let errorMessage: string;

            if (claim.privy_id === privyId && claim.eth_address === address) {
                errorCode = 'ALREADY_CLAIMED_SAME_USER';
                errorMessage = 'This user and address have already claimed welcome tokens';
            } else if (claim.privy_id === privyId) {
                errorCode = 'ALREADY_CLAIMED_SAME_USER';
                errorMessage = 'This user has already claimed welcome tokens with a different address';
            } else if (claim.eth_address === address) {
                errorCode = 'ALREADY_CLAIMED_SAME_ADDRESS';
                errorMessage = 'This address has already been used to claim welcome tokens';
            } else {
                errorCode = 'ALREADY_CLAIMED';
                errorMessage = 'Welcome tokens have already been claimed';
            }

            console.log(`🚫 INELIGIBLE WELCOME CLAIM: ${privyId} - ${errorCode}`);
            return NextResponse.json({ 
                error: errorCode,
                message: errorMessage,
                tx_hash: claim.tx_hash
            }, { status: 400 });
        }

        console.log(`✅ WELCOME CLAIM ELIGIBILITY CONFIRMED: ${privyId} can claim`);

        // Initialize ethers provider and get wallet from pool for mobile-add purpose
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const { getWalletPool } = await import('@/lib/wallet-pool');
        const walletPool = getWalletPool(provider);
        
        // Check if we should use direct wallet (pool disabled for mobile-add)
        const directWallet = walletPool.getDirectWallet('mobile-add');
        
        let adminWallet: ethers.Wallet;
        let WELCOME_AIRDROP_CONTRACT: string;
        
        if (directWallet) {
            // Use direct wallet without pool logic
            console.log(`Using direct wallet ${directWallet.wallet.address} for welcome claim (pool disabled for mobile-add)`);
            adminWallet = directWallet.wallet;
            WELCOME_AIRDROP_CONTRACT = directWallet.airdropContract;
        } else {
            // Use wallet pool
            try {
                walletConfig = await walletPool.getAvailableWallet('mobile-add');
                console.log(`Using wallet ${walletConfig.wallet.address} with contract ${walletConfig.airdropContract} for welcome claim (mobile-add)`);
                adminWallet = walletConfig.wallet;
                WELCOME_AIRDROP_CONTRACT = walletConfig.airdropContract;
            } catch (poolError) {
                const errorMessage = 'All wallets are currently busy for welcome claims. Please try again in a moment.';
                console.error('Failed to get wallet from pool for welcome claim:', poolError);
                
                return NextResponse.json({ 
                    error: errorMessage
                }, { status: 503 });
            }
        }

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
            
            // Check if it's a duplicate key error (user already claimed)
            if (newError.message?.includes('duplicate') || newError.code === '23505') {
                return NextResponse.json({ 
                    code: 'ALREADY_CLAIMED',
                    error: 'You have already claimed welcome tokens'
                }, { status: 400 });
            }
            
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
        // Release the wallet lock if using pool
        if (walletConfig && walletConfig.lockKey) {
            try {
                const { getWalletPool } = await import('@/lib/wallet-pool');
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const walletPool = getWalletPool(provider);
                await walletPool.releaseWallet(walletConfig.lockKey);
                console.log(`🔓 RELEASED WALLET LOCK: ${walletConfig.lockKey}`);
            } catch (lockError) {
                console.error('Error releasing wallet lock:', lockError);
            }
        }
        
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
