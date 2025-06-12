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

export default function TermsOfUsePage() {
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
            <h1 className="text-2xl font-bold mb-4">TERMS OF SERVICE</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Last updated: June 11, 2025</p>
            
            <p className="mb-6">QR coin is a blockchain-based experiment featuring daily auctions, link redirections, and reward claims. Participation is fully onchain, voluntary, and experimental. By using the QR coin web interface, smart contracts, or related tools (the &ldquo;Platform&rdquo;), you accept these Terms and our Privacy Policy. If you do not agree, do not use the Platform.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">1. Acceptance & Eligibility</h2>
            <p>You represent that you are (a) at least 18 years old, (b) legally capable of entering contracts in your jurisdiction, and (c) not subject to sanctions or restrictions prohibiting use of Ethereum-based services. The Platform is for entertainment, experimentation, and creative expression. It is not a lottery, sweepstakes, or investment product.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">2. Non-Custodial Wallet Use</h2>
            <p>The Platform does not custody assets or manage user wallets. You interact directly with Ethereum wallets and smart contracts. You are solely responsible for securing your private keys and wallet credentials.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">3. How QR Coin Works</h2>
            <p>Users submit a bid using $USDC in a daily auction. The highest bidder wins control of a persistent QR code for 24 hours. The QR code updates to the winner&apos;s specified URL. This may point to a website, a tweet, or other link. Site visitors can claim $QR tokens by viewing the daily winner and their link.These interactions are governed by open smart contracts and do not require approval or permission from QR Coin developers.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">4. Rewards & Claim Mechanics</h2>
            <p>Claimable $QR is distributed via public-facing links as a &ldquo;view-to-earn&rdquo; mechanic. Rewards are limited, subject to change, and not guaranteed. Bots and Sybil attacks are prohibited; eligibility may be enforced via heuristics, wallet history, or sybil resistance tools.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">5. No Securities or Investment Advice</h2>
            <p>$QR is a memecoin. It is not a security, share, investment contract, or financial product. No part of the Platform provides investment advice. You do not earn profits, dividends, or ownership rights from QR coin. Participation is for entertainment purposes only.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">6. Risks</h2>
            <p className="mb-2">You acknowledge and accept risks including (but not limited to):</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Price volatility and token illiquidity</li>
              <li>Smart contract bugs or exploits</li>
              <li>Irreversible transactions</li>
              <li>Sybil resistance errors</li>
              <li>Regulatory changes or enforcement</li>
              <li>Ineligibility for token rewards due to abuse prevention</li>
            </ul>
            <p className="mt-2">You are solely responsible for any tax liabilities or legal compliance arising from your activity.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">7. User Conduct</h2>
            <p>You must use the Platform lawfully and avoid submitting or linking to harmful, illegal, or abusive content. We reserve the right to reject the winning link without reimbursement. You may not attempt to exploit, bypass, or interfere with core mechanics. Abuse of reward systems may result in restriction or nullification of claims.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">8. Intellectual Property</h2>
            <p>QR coin and its associated branding, code, and interfaces are owned by the project creators. You retain rights to any original content you link to via redirect, but grant QR coin a royalty-free license to publicly display the associated metadata.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">9. Third-Party Services</h2>
            <p>Wallets, explorers, blockchains, analytics tools, and redirect destinations are third-party services. QR coin has no control over these and disclaims responsibility for their performance or content.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">10. Platform Changes, Suspension, or Termination</h2>
            <p>We may modify or disable off-chain features (such as reward systems or redirect UI) at any time for legal, technical, or strategic reasons. The core smart contracts onchain are permissionless.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">11. Disclaimers</h2>
            <p>The Platform is provided &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE.&rdquo; We disclaim all warranties—express or implied—including fitness for a particular purpose, non-infringement, and availability.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">12. Limitation of Liability</h2>
            <p>To the fullest extent allowed by law, QR coin and its contributors are not liable for indirect, incidental, or consequential damages, lost profits, or data loss.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">13. Indemnification</h2>
            <p>You agree to indemnify QR coin contributors from claims, liabilities, and damages arising from your use of the Platform or violation of these Terms.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">14. Governing Law & Dispute Resolution</h2>
            <p>These Terms are governed by the laws of the State of Florida (or another applicable jurisdiction if chosen later). Disputes will be resolved via confidential arbitration, with venue in Miami, Florida, under AAA Commercial Arbitration Rules. Class actions and jury trials are waived.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">15. Changes to Terms</h2>
            <p>We may revise these Terms at any time by updating this page. New users are bound immediately; existing users after 14 days. Continued use constitutes acceptance.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">16. Severability</h2>
            <p>If any clause is unenforceable, the remainder of the Terms remains in effect, with minimal adjustment to preserve intent.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">17. Entire Agreement</h2>
            <p>These Terms, along with any supplemental policies posted on qrcoin.fun, constitute the entire agreement between you and QR coin regarding use of the Platform.</p>
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
            <XLogo type="footer"
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
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link
            href="/terms-of-use"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Terms of Service
          </Link>
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px]">•</span>
          <Link
            href="/privacy-policy"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Privacy Policy
          </Link>
        </div>
      </footer>
    </main>
  );
}