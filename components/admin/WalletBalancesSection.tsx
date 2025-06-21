import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";

export function WalletBalancesSection() {
  const { walletBalances, isLoading, hasLowBalances, refetch } = useWalletBalances();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>Wallet Balances</span>
              <Skeleton className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array(9).fill(0).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="text-right space-y-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Low Balance Warning Banner */}
      {hasLowBalances && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h3 className="text-lg font-medium text-red-800 dark:text-red-300">
              ⚠️ Low Balance Alert
            </h3>
          </div>
          <p className="text-red-700 dark:text-red-400 mt-1">
            One or more wallets have low balances that require attention. Check the highlighted wallets below.
          </p>
        </div>
      )}

      {/* Wallet Balances Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <span>Wallet Balances</span>
              <div className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded">
                Auto-refreshes every 30s
              </div>
            </CardTitle>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left p-2 font-medium text-gray-900 dark:text-gray-100">Wallet</th>
                  <th className="text-left p-2 font-medium text-gray-900 dark:text-gray-100">Address</th>
                  <th className="text-right p-2 font-medium text-gray-900 dark:text-gray-100">ETH Balance</th>
                  <th className="text-right p-2 font-medium text-gray-900 dark:text-gray-100">QR Balance</th>
                  <th className="text-center p-2 font-medium text-gray-900 dark:text-gray-100">Status</th>
                </tr>
              </thead>
              <tbody>
                {walletBalances.map((wallet, index) => {
                  const hasLowBalance = wallet.isEthLow || wallet.isQrLow;
                  
                  return (
                    <tr
                      key={index}
                      className={`border-b border-gray-100 dark:border-gray-800 ${
                        hasLowBalance 
                          ? 'bg-red-50 dark:bg-red-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <td className="p-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {wallet.name}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                            {truncateAddress(wallet.address)}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(wallet.address)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Copy
                          </button>
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <div className={`font-mono ${wallet.isEthLow ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-gray-100'}`}>
                          {wallet.ethBalance} ETH
                          {wallet.isEthLow && <span className="text-xs ml-1">(LOW)</span>}
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <div className={`font-mono ${wallet.isQrLow ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-900 dark:text-gray-100'}`}>
                          {wallet.qrBalance} $QR
                          {wallet.isQrLow && <span className="text-xs ml-1">(LOW)</span>}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        {hasLowBalance ? (
                          <div title="Low Balance">
                            <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" />
                          </div>
                        ) : (
                          <div className="h-4 w-4 bg-green-500 rounded-full mx-auto" title="Healthy Balance"></div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Balance Thresholds Info */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <div>⚠️ Low balance thresholds:</div>
              <div>• ETH: &lt; $20 USD</div>
              <div>• $QR: &lt; 4200000 $QR</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 