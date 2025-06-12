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

export default function PrivacyPolicyPage() {
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
            <h1 className="text-2xl font-bold mb-4">PRIVACY POLICY</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Last updated: June 11, 2025</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">1. Scope & Purpose</h2>
            <p>This Policy explains what limited information QR coin (&ldquo;QR,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) processes when you use the QR coin web interface or interact with our smart contracts on Ethereum or Base (collectively, the &ldquo;Platform&rdquo;).</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">2. Information We Collect</h2>
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 pr-4 font-bold">Category</th>
                    <th className="text-left py-2 pr-4 font-bold">Examples</th>
                    <th className="text-left py-2 pr-4 font-bold">Source</th>
                    <th className="text-left py-2 font-bold">Legal Basis*</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4 align-top">Wallet & Transaction Data</td>
                    <td className="py-2 pr-4 align-top">Public wallet address, bid amounts, token transfers, timestamps</td>
                    <td className="py-2 pr-4 align-top">Directly from the blockchain</td>
                    <td className="py-2 align-top">Contract performance; legitimate interest (core mechanics, abuse prevention)</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4 align-top">Claim Interactions</td>
                    <td className="py-2 pr-4 align-top">Wallets claiming daily $QR rewards, transaction hash</td>
                    <td className="py-2 pr-4 align-top">Directly from onchain interaction</td>
                    <td className="py-2 align-top">Same as above</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4 align-top">Redirect Submissions</td>
                    <td className="py-2 pr-4 align-top">URLs submitted by auction winners to redirect the QR code</td>
                    <td className="py-2 pr-4 align-top">Directly from users</td>
                    <td className="py-2 align-top">Same as above</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">Error & Server Logs</td>
                    <td className="py-2 pr-4 align-top">Basic server error messages, runtime identifiers, timestamps</td>
                    <td className="py-2 pr-4 align-top">Automatically from browser interaction</td>
                    <td className="py-2 align-top">Legitimate interest (security, debugging)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <h3 className="font-bold mb-2">What We Do <strong>Not</strong> Collect</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>No names, emails, phone numbers, or real-world identifiers</li>
              <li>No IP addresses, cookies, browser fingerprints, analytics pixels, or clickstream data</li>
              <li>No device-level data or location tracking</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">3. How We Use Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Operate the Platform</strong> – to detect auctions, update the QR code destination, track claims, and log winning bids</li>
              <li><strong>Secure & Debug</strong> – to defend against abuse (e.g., Sybil attacks) and improve uptime</li>
              <li><strong>Legal Compliance</strong> – only if explicitly compelled by law (e.g., lawful subpoena)</li>
            </ul>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              We do <strong>not</strong> send marketing emails or collect user contact data.<br />
              All blockchain data is inherently public.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">4. Cookies & Similar Technologies</h2>
            <p>The QR coin website does not set any first- or third-party cookies or use tracking pixels. We may use transient in-memory session data while your browser is open, but it is never tied to your identity or stored persistently.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">5. Disclosures to Third Parties</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 pr-4 font-bold">Recipient</th>
                    <th className="text-left py-2 font-bold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4">Infrastructure Providers</td>
                    <td className="py-2">Hosting and anti-DDoS vendors who may temporarily process server logs</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4">Legal Authorities</td>
                    <td className="py-2">If compelled by valid legal process (e.g., subpoenas)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Corporate Transactions</td>
                    <td className="py-2">In the event of a merger, acquisition, or asset transfer</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">We do <strong>not</strong> sell, rent, or trade any user data.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">6. International Transfers</h2>
            <p>QR coin operates from the United States. By using the Platform, you consent to data being processed and stored in the U.S. or other jurisdictions with different data-protection laws than your own.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">7. Security</h2>
            <p>We enforce HTTPS (TLS encryption), firewall protections, and least-access permissions on internal systems. However, blockchain interaction is inherently public and irreversible. You are solely responsible for safeguarding your wallet keys and local devices.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">8. Data Retention</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 pr-4 font-bold">Data Type</th>
                    <th className="text-left py-2 font-bold">Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4">On-chain data</td>
                    <td className="py-2">Immutable and publicly available indefinitely</td>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 pr-4">Claim / Bid Records</td>
                    <td className="py-2">Stored indefinitely to maintain transparency and auditability</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Error & Server Logs</td>
                    <td className="py-2">Deleted or anonymized within 24 months unless legally necessary</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">9. Individual Rights</h2>
            <p>QR coin does not collect personally identifiable information and cannot associate wallets with identities without additional external data. Therefore, many legal privacy rights (access, deletion, correction, etc.) are not technically feasible.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">10. Children</h2>
            <p>The Platform is for users 18 years and older. We do not knowingly collect data from minors. If you believe a minor has interacted with QR coin, email us and we&apos;ll delete any related logs.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">11. Third-Party Links</h2>
            <p>Redirect destinations and links from auction winners may lead to third-party websites (e.g., x.com, custom apps, personal sites). These sites operate independently and have their own privacy practices. QR coin is not responsible for their content or data handling.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">12. Policy Updates</h2>
            <p>We may update this Privacy Policy at any time. Updates will be posted here with a revised &ldquo;Last updated&rdquo; date. Continued use of the Platform means you accept the changes.</p>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-2">13. Contact</h2>
            <p>For privacy-related inquiries:</p>
            <p className="mt-1">Email: <a href="mailto:privacy@qrcoin.fun" className="text-[#0000FF] dark:text-[#00FF00] hover:underline">privacy@qrcoin.fun</a></p>
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
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px] flex items-center h-8">•</span>
          <Link
            href="/privacy-policy"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Privacy Policy
          </Link>
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px] flex items-center h-8">•</span>
          <Link
            href="/support"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Support
          </Link>
        </div>
      </footer>
    </main>
  );
}