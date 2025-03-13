import { useAccount, useReadContract, useBlockNumber, useChainId } from 'wagmi';
import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import QRAuction from '../abi/QRAuction.json';
import { config } from "../config/config";
import { Address } from 'viem';

type QRMetadata = {
  validUntil: string;
  urlString: string;
}

type ContractData = {
  auction?: {
    tokenId: string;
    highestBid: string;
    highestBidder: string;
    startTime: string;
    endTime: string;
    settled: boolean;
    qrMetadata: QRMetadata;
    timeLeft?: string;
    status?: 'Not Started' | 'Active' | 'Ended' | 'Settled';
  };
  settings?: {
    treasury: string;
    duration: string;
    timeBuffer: string;
    minBidIncrement: string;
    reservePrice: string;
    launched: boolean;
    qrMetadata: QRMetadata;
  };
  network?: {
    chainId: number;
    blockNumber: string;
    baseFee?: string;
  };
}

export function AuctionDebug() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(15000); // 15 seconds default
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const [timeLeft, setTimeLeft] = useState<string>('');
  
  // Use wagmi hooks instead of direct ethers calls
  const { data: auctionData, isLoading: isLoadingAuction, refetch: refetchAuction } = useReadContract({
    abi: QRAuction.abi,
    address: process.env.NEXT_PUBLIC_QRAuction as Address,
    functionName: 'auction',
    config,
  });
  
  const { data: settingsData, isLoading: isLoadingSettings, refetch: refetchSettings } = useReadContract({
    abi: QRAuction.abi,
    address: process.env.NEXT_PUBLIC_QRAuction as Address,
    functionName: 'settings',
    config,
  });
  
  // Get paused state
  const { data: isPaused, refetch: refetchPaused } = useReadContract({
    abi: QRAuction.abi,
    address: process.env.NEXT_PUBLIC_QRAuction as Address,
    functionName: 'paused',
    config,
  });

  // Function to format time duration in a human-readable format
  const formatTimeLeft = (timestamp: number): string => {
    if (timestamp <= 0) return "00:00:00";
    
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor((timestamp % 3600) / 60);
    const seconds = Math.floor(timestamp % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Function to determine auction status
  const getAuctionStatus = (startTime: number, endTime: number, settled: boolean): 'Not Started' | 'Active' | 'Ended' | 'Settled' => {
    const now = Math.floor(Date.now() / 1000);
    
    if (settled) return 'Settled';
    if (now < startTime) return 'Not Started';
    if (now >= endTime) return 'Ended';
    return 'Active';
  };
  
  // Timer for countdown
  useEffect(() => {
    if (!contractData?.auction?.endTime) return;
    
    const endTimeMs = new Date(contractData.auction.endTime).getTime();
    
    const timer = setInterval(() => {
      const now = Date.now();
      const diffInSeconds = Math.floor((endTimeMs - now) / 1000);
      
      if (diffInSeconds <= 0) {
        setTimeLeft('Auction Ended');
        clearInterval(timer);
      } else {
        setTimeLeft(formatTimeLeft(diffInSeconds));
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [contractData?.auction?.endTime]);

  // Format timestamp to local time
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    console.log("[DEBUG] Fetching contract data...");
    console.log("[DEBUG] Contract address:", process.env.NEXT_PUBLIC_QRAuction);
    console.log("[DEBUG] Testnet enabled:", process.env.NEXT_PUBLIC_ENABLE_TESTNETS);
    
    if (auctionData && settingsData) {
      console.log("[DEBUG] Raw auction data:", auctionData);
      console.log("[DEBUG] Raw settings data:", settingsData);
      console.log("[DEBUG] Is contract paused:", isPaused);
      
      try {
        // Type-safe conversion of the data
        const auction = auctionData as unknown as readonly [
          bigint, // tokenId
          bigint, // highestBid
          string, // highestBidder
          bigint, // startTime
          bigint, // endTime
          boolean, // settled
          { validUntil: bigint; urlString: string } // qrMetadata
        ];
        
        const settings = settingsData as unknown as readonly [
          string, // treasury
          bigint, // duration
          bigint, // timeBuffer
          bigint, // minBidIncrement
          bigint, // reservePrice
          boolean, // launched
          { validUntil: bigint; urlString: string } // qrMetadata
        ];
        
        const startTimeSeconds = Number(auction[3]);
        const endTimeSeconds = Number(auction[4]);
        const settledStatus = Boolean(auction[5]);
        
        // Calculate auction status
        const status = getAuctionStatus(startTimeSeconds, endTimeSeconds, settledStatus);
        
        setContractData({
          auction: {
            tokenId: auction[0]?.toString() || '0',
            highestBid: auction[1] ? formatEther(auction[1]) : '0',
            highestBidder: auction[2] || '0x0',
            startTime: formatTimestamp(startTimeSeconds),
            endTime: formatTimestamp(endTimeSeconds),
            settled: settledStatus,
            status: status,
            qrMetadata: {
              validUntil: auction[6]?.validUntil ? formatTimestamp(Number(auction[6].validUntil)) : 'N/A',
              urlString: auction[6]?.urlString || ''
            }
          },
          settings: {
            treasury: settings[0] || '0x0',
            duration: `${Number(settings[1])} seconds (${Number(settings[1]) / 60} minutes)`,
            timeBuffer: `${Number(settings[2])} seconds (${Number(settings[2]) / 60} minutes)`,
            minBidIncrement: `${settings[3]}%`,
            reservePrice: settings[4] ? formatEther(settings[4]) : '0',
            launched: Boolean(settings[5]),
            qrMetadata: {
              validUntil: settings[6]?.validUntil ? formatTimestamp(Number(settings[6].validUntil)) : 'N/A',
              urlString: settings[6]?.urlString || ''
            }
          },
          network: {
            chainId,
            blockNumber: blockNumber?.toString() || 'Unknown',
          }
        });
        
        setLastRefreshTime(new Date());
      } catch (err: unknown) {
        console.error("[DEBUG] Error processing contract data:", err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    // Poll for updates
    const interval = setInterval(() => {
      refetchAuction();
      refetchSettings();
      refetchPaused();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [auctionData, settingsData, isPaused, chainId, blockNumber, refetchAuction, refetchSettings, refetchPaused, refreshInterval]);

  // Function to manually refresh data
  const handleManualRefresh = () => {
    refetchAuction();
    refetchSettings();
    refetchPaused();
    setLastRefreshTime(new Date());
  };
  
  // Function to update refresh interval
  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRefreshInterval(Number(e.target.value));
  };

  return (
    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 my-4 text-sm font-mono">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-800">🔍 QR Auction Debug Panel</h3>
        <div className="flex items-center gap-2">
          <select 
            value={refreshInterval} 
            onChange={handleIntervalChange}
            className="text-xs px-2 py-1 rounded border border-gray-300"
          >
            <option value={5000}>Refresh: 5s</option>
            <option value={15000}>Refresh: 15s</option>
            <option value={30000}>Refresh: 30s</option>
            <option value={60000}>Refresh: 1m</option>
          </select>
          <button 
            onClick={handleManualRefresh} 
            className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
          >
            Refresh Now
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Environment Section */}
        <div className="bg-white p-3 rounded shadow-sm">
          <h4 className="font-semibold mb-2 text-gray-700">Environment</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Contract:</span>
              <a 
                href={`https://sepolia.basescan.org/address/${process.env.NEXT_PUBLIC_QRAuction}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {process.env.NEXT_PUBLIC_QRAuction}
              </a>
            </div>
            <div className="flex justify-between">
              <span>Testnet Mode:</span>
              <span className={process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" ? "text-green-600" : "text-red-600"}>
                {process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Wallet Connected:</span>
              <span className={isConnected ? "text-green-600" : "text-red-600"}>
                {isConnected ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Address:</span>
              <span className="font-mono text-xs truncate max-w-[200px]">{address || 'Not connected'}</span>
            </div>
            <div className="flex justify-between">
              <span>Chain ID:</span>
              <span>{chainId || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span>Block Number:</span>
              <span>{blockNumber?.toString() || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span>Last Refreshed:</span>
              <span>{lastRefreshTime.toLocaleTimeString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Contract Paused:</span>
              <span className={isPaused ? "text-red-600" : "text-green-600"}>
                {isPaused ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>
        
        {/* Current Auction Status Section */}
        <div className="bg-white p-3 rounded shadow-sm">
          <h4 className="font-semibold mb-2 text-gray-700">Current Auction Status</h4>
          {(isLoadingAuction || isLoadingSettings) && !contractData ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-pulse text-gray-500">Loading contract data...</div>
            </div>
          ) : error ? (
            <div className="text-red-500 p-2 bg-red-50 rounded">
              Error: {error}
            </div>
          ) : contractData?.auction ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs text-white ${
                  contractData.auction.status === 'Active' ? 'bg-green-500' :
                  contractData.auction.status === 'Ended' ? 'bg-orange-500' :
                  contractData.auction.status === 'Settled' ? 'bg-blue-500' :
                  'bg-gray-500'
                }`}>
                  {contractData.auction.status}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Token ID:</span>
                <span className="font-mono">{contractData.auction.tokenId}</span>
              </div>
              
              {contractData.auction.status === 'Active' && (
                <div className="mt-2 bg-blue-50 p-2 rounded text-center">
                  <div className="text-sm text-gray-600 dark:text-[#696969]">Time Remaining</div>
                  <div className="font-mono text-xl font-bold">{timeLeft}</div>
                </div>
              )}
              
              <div className="flex justify-between">
                <span>Highest Bid:</span>
                <span className="font-mono">{contractData.auction.highestBid} ETH</span>
              </div>
              
              <div className="flex justify-between">
                <span>Highest Bidder:</span>
                <span className="font-mono text-xs truncate max-w-[180px]">
                  {contractData.auction.highestBidder === '0x0' ? 'None' : contractData.auction.highestBidder}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>URL Data:</span>
                <span className="font-mono text-xs truncate max-w-[180px]">
                  {contractData.auction.qrMetadata.urlString || 'None'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">No auction data available</div>
          )}
        </div>
      </div>
      
      {/* Auction Details Section */}
      {contractData && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-3 rounded shadow-sm">
            <h4 className="font-semibold mb-2 text-gray-700">Auction Details</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Start Time:</span>
                <span>{contractData.auction?.startTime}</span>
              </div>
              <div className="flex justify-between">
                <span>End Time:</span>
                <span>{contractData.auction?.endTime}</span>
              </div>
              <div className="flex justify-between">
                <span>Settled:</span>
                <span>{contractData.auction?.settled ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span>QR Valid Until:</span>
                <span>{contractData.auction?.qrMetadata.validUntil}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-3 rounded shadow-sm">
            <h4 className="font-semibold mb-2 text-gray-700">Contract Settings</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Treasury:</span>
                <span className="font-mono text-xs truncate max-w-[180px]">{contractData.settings?.treasury}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span>{contractData.settings?.duration}</span>
              </div>
              <div className="flex justify-between">
                <span>Time Buffer:</span>
                <span>{contractData.settings?.timeBuffer}</span>
              </div>
              <div className="flex justify-between">
                <span>Min Bid Increment:</span>
                <span>{contractData.settings?.minBidIncrement}</span>
              </div>
              <div className="flex justify-between">
                <span>Reserve Price:</span>
                <span>{contractData.settings?.reservePrice} ETH</span>
              </div>
              <div className="flex justify-between">
                <span>Launched:</span>
                <span>{contractData.settings?.launched ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Debug Actions */}
      <div className="mt-4 bg-white p-3 rounded shadow-sm">
        <h4 className="font-semibold mb-2 text-gray-700">Debug Actions</h4>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <a 
              href={`https://sepolia.basescan.org/address/${process.env.NEXT_PUBLIC_QRAuction}`}
              target="_blank"
              rel="noopener noreferrer" 
              className="bg-blue-100 hover:bg-blue-200 text-blue-800 text-center py-2 px-4 rounded text-xs"
            >
              View on BaseScan
            </a>
            <a 
              href={`https://sepolia.basescan.org/address/${process.env.NEXT_PUBLIC_QRAuction}#readContract`}
              target="_blank"
              rel="noopener noreferrer" 
              className="bg-purple-100 hover:bg-purple-200 text-purple-800 text-center py-2 px-4 rounded text-xs"
            >
              Read Contract
            </a>
            <a 
              href={`https://sepolia.basescan.org/address/${process.env.NEXT_PUBLIC_QRAuction}#writeContract`}
              target="_blank"
              rel="noopener noreferrer" 
              className="bg-green-100 hover:bg-green-200 text-green-800 text-center py-2 px-4 rounded text-xs"
            >
              Write Contract
            </a>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-center text-xs text-gray-500">
        Debug panel automatically refreshes every {refreshInterval/1000} seconds
      </div>
    </div>
  );
} 