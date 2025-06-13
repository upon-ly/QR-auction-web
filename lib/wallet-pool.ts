import { ethers } from 'ethers';
import { Redis } from '@upstash/redis';

// Initialize Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Wallet configuration
export interface WalletConfig {
  wallet: ethers.Wallet;
  airdropContract: string;
  purpose?: 'main-airdrop' | 'link-miniapp' | 'likes-recasts' | 'link-web' | 'general'; // Purpose of this wallet
}

// Wallet pool configuration
export class WalletPool {
  private walletConfigs: WalletConfig[] = [];
  private provider: ethers.JsonRpcProvider;
  
  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.initializeWallets();
  }
  
  private initializeWallets() {
    // Existing wallet configurations with their dedicated purposes (for backwards compatibility)
    
    // Wallet 1: Main airdrop (ADMIN_PRIVATE_KEY + AIRDROP_CONTRACT_ADDRESS)
    if (process.env.ADMIN_PRIVATE_KEY && process.env.AIRDROP_CONTRACT_ADDRESS) {
      this.walletConfigs.push({
        wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, this.provider),
        airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS,
        purpose: 'main-airdrop'
      });
    }
    
    // Wallet 2: Link visit miniapp (ADMIN_PRIVATE_KEY2 + AIRDROP_CONTRACT_ADDRESS2)
    if (process.env.ADMIN_PRIVATE_KEY2 && process.env.AIRDROP_CONTRACT_ADDRESS2) {
      this.walletConfigs.push({
        wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY2, this.provider),
        airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS2,
        purpose: 'link-miniapp'
      });
    }
    
    // Wallet 3: Likes/recasts (ADMIN_PRIVATE_KEY3 + AIRDROP_CONTRACT_ADDRESS3)
    if (process.env.ADMIN_PRIVATE_KEY3 && process.env.AIRDROP_CONTRACT_ADDRESS3) {
      this.walletConfigs.push({
        wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY3, this.provider),
        airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS3,
        purpose: 'likes-recasts'
      });
    }
    
    // Wallet 4: Link visit web (ADMIN_PRIVATE_KEY4 + AIRDROP_CONTRACT_ADDRESS4)
    if (process.env.ADMIN_PRIVATE_KEY4 && process.env.AIRDROP_CONTRACT_ADDRESS4) {
      this.walletConfigs.push({
        wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY4, this.provider),
        airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS4,
        purpose: 'link-web'
      });
    }
    
    // Additional wallet configurations using new naming convention
    // These new wallets are 'general' purpose and can be used by any endpoint
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`WALLET_PRIVATE_KEY_${i}`];
      const contract = process.env[`AIRDROP_CONTRACT_ADDRESS_${i}`];
      
      if (key && contract) {
        this.walletConfigs.push({
          wallet: new ethers.Wallet(key, this.provider),
          airdropContract: contract,
          purpose: 'general' // New wallets can be used by any endpoint
        });
      }
    }
    
    console.log(`Initialized wallet pool with ${this.walletConfigs.length} wallet/contract pairs`);
    this.walletConfigs.forEach((config, i) => {
      console.log(`  Wallet ${i + 1}: ${config.wallet.address} → Contract: ${config.airdropContract} (${config.purpose || 'general'})`);
    });
  }
  
  // Method to get direct wallet without pool logic (for disabling pool temporarily)
  getDirectWallet(purpose: 'main-airdrop' | 'likes-recasts' | 'link-web' | 'link-miniapp'): { wallet: ethers.Wallet; airdropContract: string } | null {
    // Check if wallet pool is disabled for this purpose
    const disabledPurposes = process.env.WALLET_POOL_DISABLED_PURPOSES?.split(',') || [];
    if (!disabledPurposes.includes(purpose)) {
      return null; // Pool is not disabled, return null to use pool logic
    }
    
    // Return direct wallet configuration based on purpose
    switch (purpose) {
      case 'main-airdrop':
        if (process.env.ADMIN_PRIVATE_KEY && process.env.AIRDROP_CONTRACT_ADDRESS) {
          return {
            wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, this.provider),
            airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS
          };
        }
        break;
      case 'likes-recasts':
        if (process.env.ADMIN_PRIVATE_KEY3 && process.env.AIRDROP_CONTRACT_ADDRESS3) {
          return {
            wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY3, this.provider),
            airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS3
          };
        }
        break;
      case 'link-web':
        if (process.env.ADMIN_PRIVATE_KEY4 && process.env.AIRDROP_CONTRACT_ADDRESS4) {
          return {
            wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY4, this.provider),
            airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS4
          };
        }
        break;
      case 'link-miniapp':
        if (process.env.ADMIN_PRIVATE_KEY2 && process.env.AIRDROP_CONTRACT_ADDRESS2) {
          return {
            wallet: new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY2, this.provider),
            airdropContract: process.env.AIRDROP_CONTRACT_ADDRESS2
          };
        }
        break;
    }
    
    return null;
  }
  
  async getAvailableWallet(purpose?: 'main-airdrop' | 'link-miniapp' | 'likes-recasts' | 'link-web'): Promise<{ wallet: ethers.Wallet; airdropContract: string; lockKey: string }> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let retry = 0; retry < maxRetries; retry++) {
      // First, try to find a wallet with the specific purpose (backwards compatibility)
      if (purpose) {
        for (const config of this.walletConfigs) {
          if (config.purpose === purpose) {
            const lockKey = `wallet_lock:${config.wallet.address}`;
            
            try {
              // Try to acquire lock with 60 second expiry
              const acquired = await redis.set(lockKey, '1', {
                nx: true, // Only set if not exists
                ex: 60    // Expire after 60 seconds
              });
              
              if (acquired) {
                return { 
                  wallet: config.wallet, 
                  airdropContract: config.airdropContract,
                  lockKey 
                };
              }
            } catch (error) {
              console.error(`Error acquiring lock for wallet ${config.wallet.address}:`, error);
              lastError = error as Error;
            }
          }
        }
      }
      
      // If no dedicated wallet available (or no purpose specified), try general purpose wallets
      for (const config of this.walletConfigs) {
        if (config.purpose === 'general' || !purpose) {
          const lockKey = `wallet_lock:${config.wallet.address}`;
          
          try {
            // Try to acquire lock with 60 second expiry
            const acquired = await redis.set(lockKey, '1', {
              nx: true, // Only set if not exists
              ex: 60    // Expire after 60 seconds
            });
            
            if (acquired) {
              return { 
                wallet: config.wallet, 
                airdropContract: config.airdropContract,
                lockKey 
              };
            }
          } catch (error) {
            console.error(`Error acquiring lock for wallet ${config.wallet.address}:`, error);
            lastError = error as Error;
          }
        }
      }
      
      // If no wallet available, wait a bit before retrying
      if (retry < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }
    }
    
    throw new Error(`All ${this.walletConfigs.length} wallets are busy. Last error: ${lastError?.message}`);
  }
  
  async releaseWallet(lockKey: string): Promise<void> {
    try {
      await redis.del(lockKey);
    } catch (error) {
      console.error(`Error releasing wallet lock ${lockKey}:`, error);
    }
  }
  
  getWalletCount(): number {
    return this.walletConfigs.length;
  }
  
  getWalletInfo(): { address: string; contract: string }[] {
    return this.walletConfigs.map(config => ({
      address: config.wallet.address,
      contract: config.airdropContract
    }));
  }
}

// Singleton instance
let walletPool: WalletPool | null = null;

export function getWalletPool(provider: ethers.JsonRpcProvider): WalletPool {
  if (!walletPool) {
    walletPool = new WalletPool(provider);
  }
  return walletPool;
}