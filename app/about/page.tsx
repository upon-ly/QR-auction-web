"use client";

import Link from "next/link";
import { useBaseColors } from "@/hooks/useBaseColors";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";

export default function AboutPage() {
  const isBaseColors = useBaseColors();
  const [copied, setCopied] = useState(false);

  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;
  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("CA copied!");
  };

  return (
    <main className="min-h-screen p-4 md:px-8 md:pb-8">
      <div className="max-w-3xl mx-auto">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold mb-2">What is this?</h2>
            <p className="mb-2"><Link href="https://qrcoin.fun" className="text-[#0000FF] dark:text-[#00FF00] hover:underline">qrcoin.fun</Link> is a website with a daily auction.</p>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-2">What&apos;s the auction for?</h2>
            <p>The winner of the daily auction decides where the QR points for a day.</p>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-2">Why would people want to do that?</h2>
            <p>Winning our daily auction is a great way to bring attention to any website for a day.</p>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-2">How does winning bring attention to the website?</h2>
            <p className="mb-3">Long-term: the goal is to have our QR widely distributed in both the physical and digital worlds. Since the QR never changes, we can continue to compound its distribution over time to bring an increasing amount of attention to our auction winners.</p>
            <p>Near-term: most of the attention will be driven through our daily winner announcements on X, notifications sent to farcaster users, and other mostly digital drivers of attention. Our daily winner announcements have each received thousands or tens of thousands of views and our daily distribution should only get larger with time. So far, we have helped tokens increase market cap, projects add new users, and charities raise money, among many other use cases.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">Why is it called qrcoin.fun?</h2>
            <p>There is a cryptocurrency connected to the project called QR coin ($QR).</p>
            <p className="font-mono text-sm mt-2">The contract address is: 0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF</p>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-2">How do I bid on the auction?</h2>
            <p>Go to <Link href="https://qrcoin.fun" className="text-[#0000FF] dark:text-[#00FF00] hover:underline">qrcoin.fun</Link>, sign up with your email address, and pay with Apple Pay or credit card in a few clicks. If you’re into crypto, you can optionally connect your wallet to pay with USDC.</p>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-2">What happens if I am outbid?</h2>
            <p>If and when you are outbid, you get your money back immediately.</p>
          </div>
          
          
          <div>
            <h2 className="text-xl font-bold mb-2">How is the coin connected to the project?</h2>
            <p>We have used and plan to continue to use a portion of the revenues from our daily auctions to buy $QR. This auction-driven demand for the coin should theoretically allow people who believe in the project to bet on its success by buying and holding $QR. If and as the project becomes more popular over time, the price of the coin could increase accordingly. This relationship between the project&apos;s success and the QR coin&apos;s price should incentivize $QR holders from around the world to help promote the project.</p>
          </div>
          
          <div>
            <h2 className="text-xl font-bold mb-2">How can $QR holders help to promote the project?</h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Bid on our daily auctions</li>
              <li>Boost our daily winner announcements on X (like or RT)</li>
              <li>Spread the QR code in the digital world (i.e. add it to your website, profile, etc.)</li>
              <li>Spread the QR code in the physical world (i.e. post stickers, flyers, billboards, etc.)</li>
              <li>Share the project with friends</li>
            </ol>
          </div>
        </div>
      </div>

      <footer className="mt-10 text-center flex flex-col items-center">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a
            href="https://x.com/QRcoindotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="X (formerly Twitter)"
          >
            <XLogo 
              size="md"
              
              className="ml-1 opacity-80 hover:opacity-100"
            />
          </a>
          <a
            href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Dexscreener"
          >
            <DexscreenerLogo />
          </a>
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Uniswap"
          >
            <UniswapLogo />
          </a>
        </div>
        <div
          className="inline-flex items-center text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label
            className={clsx(
              isBaseColors ? "text-foreground" : "",
              "mr-1 cursor-pointer"
            )}
          >
            CA: {contractAddress}
          </label>
          <button
            onClick={copyToClipboard}
            className={clsx(
              isBaseColors
                ? " text-foreground hover:text-primary/90"
                : "hover:bg-gray-100",
              "p-1 rounded-full transition-colors"
            )}
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check
                className={clsx(
                  isBaseColors ? "text-foreground" : "text-green-500",
                  "h-3 w-3"
                )}
              />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
      </footer>
    </main>
  );
} 