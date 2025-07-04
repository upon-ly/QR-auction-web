import { ethers } from 'ethers';
import { fetchUserWithScore } from './neynar';
import { getClaimAmountByScore } from './claim-amounts';

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
 * Determine claim amount based on wallet holdings
 * @returns 100 if wallet is empty or only has QR tokens, 500 otherwise
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
  
  const amount = hasValue ? 500 : 100;
  const reason = hasValue 
    ? 'Wallet has ETH or other tokens on Base' 
    : 'Wallet is empty or only contains QR tokens on Base';
  
  console.log(`💰 Claim Amount: ${amount} QR (${reason})\n`);
  
  return { amount, reason, balances };
}

/**
 * Get claim amount for a specific claim source and address
 * This is a wrapper that handles the claim source logic
 * Now with Neynar score override for all users
 */
export async function getClaimAmountForAddress(
  address: string,
  claimSource: string,
  alchemyApiKey: string,
  fid?: number
): Promise<number> {
  // First, check if we have a FID and can get Neynar score
  if (fid && fid > 0) {
    try {
      const userData = await fetchUserWithScore(fid);
      if (userData.neynarScore !== undefined && !userData.error) {
        // Use Neynar score to determine amount
        const claimConfig = getClaimAmountByScore(userData.neynarScore);
        console.log(`🎯 Using Neynar score for FID ${fid}: ${userData.neynarScore} (${claimConfig.tier}) = ${claimConfig.amount} QR`);
        return claimConfig.amount;
      }
    } catch (error) {
      console.error('Error fetching Neynar score, falling back to wallet balance check:', error);
    }
  }
  
  // Fallback to wallet balance check for web and mobile users
  if (['web', 'mobile'].includes(claimSource)) {
    const { amount } = await determineClaimAmount(address, alchemyApiKey);
    console.log(`💰 Fallback to wallet balance check: ${amount} QR`);
    return amount;
  }
  
  // Mini-app users without Neynar score get default 100 QR
  return 100;
}