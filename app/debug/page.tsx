"use client";

import { useEffect, useState } from "react";
import { AuctionDebug } from "@/components/AuctionDebug";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export default function DebugPage() {
  const [mounted, setMounted] = useState(false);

  // Wait for component to mount to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  
  const isTestnet = process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true";

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              &larr; Back to main
            </Link>
            <h1 className="text-2xl font-bold">QR Auction Debug</h1>
          </div>
          <ConnectButton />
        </div>
        
        {!isTestnet && (
          <div className="p-6 bg-amber-100 text-amber-800 rounded-lg mb-8">
            <h2 className="text-lg font-semibold mb-2">⚠️ Warning: Testnet mode is disabled</h2>
            <p>
              Debug information is only available when NEXT_PUBLIC_ENABLE_TESTNETS is set to &quot;true&quot;.
              Please check your environment configuration.
            </p>
          </div>
        )}
        
        {isTestnet && (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 text-blue-800 rounded-lg">
              <h2 className="text-lg font-semibold mb-2">ℹ️ Debug Information</h2>
              <p>
                This page displays detailed debugging information about the QR auction contract.
                It includes real-time data about the current auction, contract settings, and environment variables.
              </p>
            </div>
            
            <AuctionDebug />
            
            <div className="p-4 bg-green-50 text-green-800 rounded-lg mt-8">
              <h2 className="text-lg font-semibold mb-2">📋 How to use this page</h2>
              <ul className="list-disc list-inside space-y-1">
                <li>Connect your wallet to see more detailed information</li>
                <li>Contract data refreshes automatically every 15 seconds</li>
                <li>Use this page to debug issues with auctions and bidding</li>
                <li>Check environment variables to ensure proper configuration</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}