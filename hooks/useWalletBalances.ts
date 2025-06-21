import { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { formatEther, formatUnits } from 'viem';
import { base } from 'wagmi/chains';
import { QR_TOKEN_ADDRESS } from '@/config/tokens';
import useEthPrice from '@/hooks/useEthPrice';

// ERC20 ABI for balance checking
const ERC20_ABI = [
  {
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Wallet definitions
export const TRACKED_WALLETS = [
  {
    name: 'QR Mini App Adds',
    address: '0x853835Cd1D420476F5791Ac7ac399Be4D21D2069'
  },
  {
    name: 'QR Website Claims',
    address: '0x37C01A876eecBd916c689D540Fc4FB19D1Dd247F'
  },
  {
    name: 'QR Mini App Claims',
    address: '0xF00Ce533a2aafEC8A38f2A94AaE693ca77b65077'
  },
  {
    name: 'Mini App Claim +1',
    address: '0xeFbC15f70c19cC21C5b5bD24d4F7D0f0eEe672d9'
  },
  {
    name: 'Mini App Claim +2',
    address: '0x81d422932b0a8414Dd54e7DCC20D495af14D3730'
  },
  {
    name: 'Mini App Claim +3',
    address: '0x474a2FF8EC14DbD05610FfDE675376b0A4aDFC28'
  },
  {
    name: 'Mini App Claim +4',
    address: '0x1b28AdD24511E253f0F9084afd72CE7C0ECE162f'
  },
  {
    name: 'Mini App Claim +5',
    address: '0x2Df989673806002c7ecc744f266D264D7cBFcb34'
  },
  {
    name: 'Mini App Claim Fail Retries',
    address: '0xcc6bBF8693B63388eB64F10281dE74DeFfC4D1E0'
  },
  {
    name: 'QR iOS App Adds',
    address: '0xe79E636fa40fcbACc27478aA8f03D2C2BB03c6AB'
  },
  {
    name: 'QR iOS App Claims',
    address: '0xEBbC71022a8407Bda9C28255F38970A05D52D1F1'
  }
] as const;

export interface WalletBalance {
  name: string;
  address: string;
  ethBalance: string;
  qrBalance: string;
  ethBalanceRaw: bigint;
  qrBalanceRaw: bigint;
  isEthLow: boolean;
  isQrLow: boolean;
}

// Thresholds for low balance warnings
const ETH_LOW_THRESHOLD_USD = 20; // $5 USD
const QR_LOW_THRESHOLD = 4200000; // 100,000 QR tokens

export function useWalletBalances() {
  const [ethBalances, setEthBalances] = useState<{ [address: string]: bigint }>({});
  const [isLoadingEth, setIsLoadingEth] = useState(true);
  const { ethPrice, isLoading: isLoadingEthPrice } = useEthPrice();

  // Prepare QR token balance calls
  const qrBalanceCalls = TRACKED_WALLETS.map((wallet) => ({
    address: QR_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [wallet.address as `0x${string}`],
    chainId: base.id,
  }));

  // Fetch QR token balances
  const { data: qrBalanceResults, isLoading: isLoadingQr, refetch } = useReadContracts({
    contracts: qrBalanceCalls,
    query: {
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  });

  // Fetch ETH balances using web3 provider
  useEffect(() => {
    const fetchEthBalances = async () => {
      setIsLoadingEth(true);
      try {
        const balancePromises = TRACKED_WALLETS.map(async (wallet) => {
          const response = await fetch(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: [wallet.address, 'latest'],
              id: 1,
            }),
          });
          const data = await response.json();
          return {
            address: wallet.address,
            balance: BigInt(data.result),
          };
        });

        const results = await Promise.all(balancePromises);
        const balanceMap: { [address: string]: bigint } = {};
        results.forEach(({ address, balance }) => {
          balanceMap[address] = balance;
        });
        setEthBalances(balanceMap);
      } catch (error) {
        console.error('Error fetching ETH balances:', error);
      } finally {
        setIsLoadingEth(false);
      }
    };

    fetchEthBalances();
    
    // Set up interval to refetch ETH balances every 30 seconds
    const interval = setInterval(fetchEthBalances, 30000);
    return () => clearInterval(interval);
  }, []);

  // Process and combine balance data
  const walletBalances: WalletBalance[] = TRACKED_WALLETS.map((wallet, index) => {
    const ethBalanceRaw = ethBalances[wallet.address] || 0n;
    const qrBalanceResult = qrBalanceResults?.[index];
    const qrBalanceRaw = (qrBalanceResult?.status === 'success' ? qrBalanceResult.result : 0n) as bigint;
    
    const ethBalance = formatEther(ethBalanceRaw);
    const qrBalance = formatUnits(qrBalanceRaw, 18);
    
    // Calculate ETH low threshold based on USD value
    const ethUsdPrice = ethPrice?.ethereum?.usd || 0;
    const ethLowThresholdInEth = ethUsdPrice > 0 ? ETH_LOW_THRESHOLD_USD / ethUsdPrice : 0.007;
    const isEthLow = parseFloat(ethBalance) < ethLowThresholdInEth;
    const isQrLow = parseFloat(qrBalance) < QR_LOW_THRESHOLD;

    return {
      name: wallet.name,
      address: wallet.address,
      ethBalance: parseFloat(ethBalance).toFixed(4),
      qrBalance: Math.floor(parseFloat(qrBalance)).toLocaleString(),
      ethBalanceRaw,
      qrBalanceRaw,
      isEthLow,
      isQrLow,
    };
  });

  const hasLowBalances = walletBalances.some(wallet => wallet.isEthLow || wallet.isQrLow);

  return {
    walletBalances,
    isLoading: isLoadingEth || isLoadingQr || isLoadingEthPrice,
    hasLowBalances,
    refetch,
  };
} 