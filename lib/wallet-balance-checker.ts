import { ethers } from 'ethers';
import { fetchUserWithScore } from './neynar';
import { getClaimAmountByScoreAsync } from './claim-amounts';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Chain configurations - Only Base chain
const CHAIN_CONFIGS = {
  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/'
  }
};

// QR Token address (same on all chains if deployed)
const QR_TOKEN_ADDRESS = '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF';

// Note: ERC20 ABI not needed as we use Alchemy's alchemy_getTokenBalances method

interface TokenBalance {
  contractAddress: string;
  tokenBalance: string;
  error?: string;
}

interface ChainBalance {
  chain: string;
  nativeBalance: bigint;
  hasNativeBalance: boolean;
  hasNonQRTokens: boolean;
  error?: string;
}

/**
 * Get native balance using Alchemy JSON-RPC
 */
async function getNativeBalance(
  address: string, 
  rpcUrl: string,
  apiKey: string
): Promise<bigint> {
  const response = await fetch(`${rpcUrl}${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: 1
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  
  return BigInt(data.result);
}

/**
 * Get token balances using Alchemy Enhanced API
 */
async function getTokenBalances(
  address: string,
  rpcUrl: string,
  apiKey: string
): Promise<TokenBalance[]> {
  const response = await fetch(`${rpcUrl}${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alchemy_getTokenBalances',
      params: [address, 'erc20'],
      id: 1
    })
  });

  const data = await response.json();
  if (data.error) {
    // Some chains might not support this method, return empty array
    console.warn(`Token balance fetch error: ${data.error.message}`);
    return [];
  }
  
  return data.result?.tokenBalances || [];
}

/**
 * Check if wallet has only QR tokens or is empty on Base chain
 */
async function checkWalletBalancesOnBase(
  address: string,
  alchemyApiKey: string
): Promise<ChainBalance[]> {
  const results: ChainBalance[] = [];
  
  for (const [, config] of Object.entries(CHAIN_CONFIGS)) {
    try {
      console.log(`Checking ${config.name} balances for ${address}...`);
      
      // Get native balance
      const nativeBalance = await getNativeBalance(
        address, 
        config.rpcUrl, 
        alchemyApiKey
      );
      
      // Get token balances
      const tokenBalances = await getTokenBalances(
        address,
        config.rpcUrl,
        alchemyApiKey
      );
      
      // Check if has non-QR tokens
      const hasNonQRTokens = tokenBalances.some(token => {
        // Filter out tokens with zero balance
        const balance = BigInt(token.tokenBalance || '0');
        if (balance === 0n) return false;
        
        const isNotQR = token.contractAddress.toLowerCase() !== QR_TOKEN_ADDRESS.toLowerCase();
        return isNotQR;
      });
      
      results.push({
        chain: config.name,
        nativeBalance,
        hasNativeBalance: nativeBalance > 0n,
        hasNonQRTokens,
        error: undefined
      });
      
    } catch (error) {
      console.error(`Error checking ${config.name}:`, error);
      results.push({
        chain: config.name,
        nativeBalance: 0n,
        hasNativeBalance: false,
        hasNonQRTokens: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return results;
}

/**
 * Get wallet-based claim amounts from database
 */
async function getWalletClaimAmounts(): Promise<{ emptyAmount: number; valueAmount: number }> {
  try {
    const { data, error } = await supabase
      .from('claim_amount_configs')
      .select('category, amount')
      .eq('is_active', true)
      .in('category', ['wallet_empty', 'wallet_has_balance']);

    if (error) {
      console.error('Error fetching wallet claim amounts:', error);
      throw new Error(`Failed to fetch wallet claim amounts: ${error.message}`);
    }

    const emptyConfig = data?.find(row => row.category === 'wallet_empty');
    const valueConfig = data?.find(row => row.category === 'wallet_has_balance');

    if (!emptyConfig) {
      throw new Error('Missing wallet_empty configuration in database');
    }
    if (!valueConfig) {
      throw new Error('Missing wallet_has_balance configuration in database');
    }

    return {
      emptyAmount: emptyConfig.amount,
      valueAmount: valueConfig.amount
    };
  } catch (error) {
    console.error('Error fetching wallet claim amounts:', error);
    throw error; // Re-throw to force proper error handling upstream
  }
}

/**
 * Determine claim amount based on wallet holdings
 * @returns Configured amount based on wallet status
 */
export async function determineClaimAmount(
  address: string,
  alchemyApiKey: string
): Promise<{ amount: number; reason: string; balances: ChainBalance[] }> {
  console.log(`\n🔍 WALLET BALANCE CHECK: Determining claim amount for ${address} on Base chain`);
  
  const balances = await checkWalletBalancesOnBase(address, alchemyApiKey);
  
  // Check if wallet has any value besides QR tokens
  const hasValue = balances.some(balance => 
    balance.hasNativeBalance || balance.hasNonQRTokens
  );
  
  // Get claim amounts from database
  const { emptyAmount, valueAmount } = await getWalletClaimAmounts();
  
  // Log detailed results
  console.log(`📊 Base Chain Balance:`);
  balances.forEach(balance => {
    if (!balance.error) {
      console.log(`  Native: ${ethers.formatEther(balance.nativeBalance)} ETH`);
      console.log(`  Has non-QR tokens: ${balance.hasNonQRTokens}`);
    } else {
      console.log(`  Error: ${balance.error}`);
    }
  });
  
  const amount = hasValue ? valueAmount : emptyAmount;
  const reason = hasValue 
    ? 'Wallet has ETH or other tokens on Base' 
    : 'Wallet is empty or only contains QR tokens on Base';
  
  console.log(`💰 Claim Amount: ${amount} QR (${reason})\n`);
  
  return { amount, reason, balances };
}

/**
 * Check if a FID has a spam label of value 2 (high quality user override)
 * @param fid - The Farcaster ID to check
 * @returns true if the user has spam label value 2
 */
async function hasHighQualitySpamLabel(fid: number): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('spam_labels')
      .select('label_value')
      .eq('fid', fid)
      .eq('label_type', 'spam')
      .eq('label_value', 2)
      .limit(1);
    
    if (error) {
      console.error('Error checking spam labels:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking spam labels:', error);
    return false;
  }
}

/**
 * Get claim amount for a specific claim source and address
 * This is a wrapper that handles the claim source logic
 * Now with Neynar score override for all users
 * Also includes spam label override - users with spam label value 2 get top rewards
 */
export async function getClaimAmountForAddress(
  address: string,
  claimSource: string,
  alchemyApiKey: string,
  fid?: number
): Promise<{ amount: number; neynarScore?: number; hasSpamLabelOverride?: boolean }> {
  // First, check if we have a FID and can check for spam label override
  if (fid && fid > 0) {
    try {
      // Check if user has high quality spam label (value 2)
      const hasSpamOverride = await hasHighQualitySpamLabel(fid);
      
      // If user has spam label 2, they get top rewards regardless of Neynar score
      if (hasSpamOverride) {
        console.log(`🏆 FID ${fid} has spam label value 2 - awarding top tier rewards (1000 QR) regardless of Neynar score`);
        
        // Still fetch Neynar score for logging/tracking purposes
        let neynarScore: number | undefined;
        try {
          const userData = await fetchUserWithScore(fid);
          if (userData.neynarScore !== undefined && !userData.error) {
            neynarScore = userData.neynarScore;
            console.log(`📊 (For reference: Neynar score is ${neynarScore})`);
          }
        } catch (error) {
          console.error('Error fetching Neynar score:', error);
        }
        
        return { amount: 1000, neynarScore, hasSpamLabelOverride: true };
      }
      
      // No spam override, check Neynar score as usual
      const userData = await fetchUserWithScore(fid);
      if (userData.neynarScore !== undefined && !userData.error) {
        // Use Neynar score to determine amount (async version for database)
        const claimConfig = await getClaimAmountByScoreAsync(userData.neynarScore);
        console.log(`🎯 Using Neynar score for FID ${fid}: ${userData.neynarScore} (${claimConfig.tier}) = ${claimConfig.amount} QR`);
        return { amount: claimConfig.amount, neynarScore: userData.neynarScore };
      }
    } catch (error) {
      console.error('Error fetching Neynar score, falling back to wallet balance check:', error);
    }
  }
  
  // Fallback to wallet balance check for web and mobile users
  if (['web', 'mobile'].includes(claimSource)) {
    const { amount } = await determineClaimAmount(address, alchemyApiKey);
    console.log(`💰 Fallback to wallet balance check: ${amount} QR`);
    return { amount };
  }
  
  // Mini-app users without Neynar score get default amount from database
  try {
    const { data, error } = await supabase
      .from('claim_amount_configs')
      .select('amount')
      .eq('category', 'default')
      .eq('is_active', true)
      .single();
    
    if (error) {
      throw new Error(`Failed to fetch default claim amount: ${error.message}`);
    }
    
    if (!data) {
      throw new Error('Missing default configuration in database');
    }
    
    return { amount: data.amount };
  } catch (error) {
    console.error('Error fetching default claim amount:', error);
    throw error; // Re-throw to force proper error handling upstream
  }
}