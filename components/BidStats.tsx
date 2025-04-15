'use client';

import { useAuctionMetrics } from '@/hooks/useAuctionMetrics';
import { useTokenPrice } from '@/hooks/useTokenPrice';
import { Skeleton } from './ui/skeleton';
import clsx from 'clsx';
import { useBaseColors } from '@/hooks/useBaseColors';

// QR Token total supply is 100 billion
const QR_TOTAL_SUPPLY = 100_000_000_000;

export default function BidStats() {
  const { data, isLoading } = useAuctionMetrics();
  const { priceUsd: qrPriceUsd } = useTokenPrice();
  const isBaseColors = useBaseColors();

  const formatUsd = (value: number | undefined) => {
    if (value === undefined) return '$0';
    
    // Format with commas and no decimal places for large numbers
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatQrAmount = (value: number | undefined) => {
    if (value === undefined || value === 0) return '0';
    
    // Format in billions for large numbers
    if (value >= 1_000_000_000) {
      const billions = value / 1_000_000_000;
      return `${billions.toFixed(1)}B`;
    }
    
    // Format in millions for medium numbers
    if (value >= 1_000_000) {
      const millions = value / 1_000_000;
      return `${millions.toFixed(1)}M`;
    }
    
    // Format with commas for smaller numbers
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  const calculateSupplyPercentage = (value: number | undefined) => {
    if (value === undefined) return 0;
    
    return (value / QR_TOTAL_SUPPLY) * 100;
  };

  // Calculate QR token amount equivalent to USD value
  const calculateQrTokensFromUsd = (usdValue: number | undefined) => {
    if (!usdValue || !qrPriceUsd) return 0;
    return usdValue / qrPriceUsd;
  };

  // Get QR token amount representing total bid value
  const qrTokensEquivalent = calculateQrTokensFromUsd(data?.totalBidValueUsd);
  const supplyPercentage = calculateSupplyPercentage(qrTokensEquivalent);

  return (
    <div 
      className={clsx(
        "border rounded-lg h-full flex flex-col shadow-none",
        isBaseColors ? "bg-primary/5" : "bg-white dark:bg-black"
      )}
      style={{ boxShadow: 'none' }}
    >
      <div className="text-center flex-1 flex flex-col justify-center p-6">
        {isLoading ? (
          <Skeleton className="h-12 w-56 mx-auto mb-1"/>
        ) : (
          <div className="text-3xl md:text-4xl font-bold">
            {formatUsd(data?.totalBidValueUsd)}
          </div>
        )}
        {/* <p className={clsx(
          isBaseColors ? "text-foreground/70" : "text-gray-500 dark:text-gray-400",
          "text-sm mt-1"
        )}>
          in total bids to date
        </p> */}
        
        {isLoading ? (
          <Skeleton className="h-4 w-48 mx-auto mt-1"/>
        ) : (
          <p className={clsx(
            isBaseColors ? "text-foreground/70" : "text-gray-500 dark:text-gray-400",
            "text-sm mt-0.5"
          )}>
            = {formatQrAmount(qrTokensEquivalent)} $QR ({supplyPercentage.toFixed(1)}% of supply)
          </p>
        )}
      </div>
    </div>
  );
} 