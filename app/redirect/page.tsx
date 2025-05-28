/* eslint-disable @typescript-eslint/no-explicit-any */
// app/redirect/page.tsx
import { redirect } from "next/navigation";
import { ethers } from "ethers";
import QRAuctionV3ABI from "@/abi/QRAuctionV3.json"; 
import QRAuctionV2ABI from "@/abi/QRAuctionV2.json";
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import type { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers';

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper function to get client IP from headers (prefer IPv4)
function getClientIP(headersList: ReadonlyHeaders): string | null {
  // Helper function to check if an IP is IPv4
  const isIPv4 = (ip: string): boolean => {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  };

  // Helper function to extract IPv4 from comma-separated list
  const extractIPv4 = (ipList: string): string | null => {
    const ips = ipList.split(',').map(ip => ip.trim());
    // Find the first IPv4 address in the list
    for (const ip of ips) {
      if (isIPv4(ip)) {
        return ip;
      }
    }
    return null;
  };

  // Check x-forwarded-for header (prefer IPv4)
  const forwardedFor = headersList.get('x-forwarded-for');
  if (forwardedFor) {
    const ipv4 = extractIPv4(forwardedFor);
    if (ipv4) {
      return ipv4;
    }
  }
  
  // Check x-real-ip header (prefer IPv4)
  const realIP = headersList.get('x-real-ip');
  if (realIP && isIPv4(realIP)) {
    return realIP;
  }
  
  // Check cf-connecting-ip header (prefer IPv4)
  const cfConnectingIP = headersList.get('cf-connecting-ip');
  if (cfConnectingIP && isIPv4(cfConnectingIP)) {
    return cfConnectingIP;
  }
  
  // Check for localhost/development
  const host = headersList.get('host');
  if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    return 'localhost';
  }
  
  // If no IPv4 found, fall back to any IP (including IPv6) as last resort
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return null;
}

export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;
  
  const provider = new ethers.JsonRpcProvider(
    `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
  );

  // Contract addresses from environment variables
  const v3ContractAddress = process.env.NEXT_PUBLIC_QRAuctionV3 as string;
  const v2ContractAddress = process.env.NEXT_PUBLIC_QRAuctionV2 as string;

  // Instantiate both contracts
  const v3Contract = new ethers.Contract(
    v3ContractAddress,
    QRAuctionV3ABI.abi,
    provider
  );
  
  const v2Contract = new ethers.Contract(
    v2ContractAddress,
    QRAuctionV2ABI.abi,
    provider
  );

  let qrMetaUrl: string;
  let currentTokenId: number = 0;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const fallbackURL = process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string;

  try {
    // Get current auction ID from V3 contract to check if we're on auction #62
    const v3Settings = await v3Contract.settings();
    const v3Auction = await v3Contract.auction();
    currentTokenId = Number(v3Auction.tokenId);
    
    // Special case for auction #62 - we need to get URL from auction #61 (V2)
    if (currentTokenId === 62) {
      try {
        // Try to get auction #61 URL from V2 contract
        const v2Settings = await v2Contract.settings();
        qrMetaUrl = v2Settings[6]?.urlString || fallbackURL;
        
        if (qrMetaUrl === "0x") {
          qrMetaUrl = fallbackURL;
        } else {
          const contractTimestamp = Number(v2Settings[6]?.validUntil || 0);
          if (currentTimestamp > contractTimestamp) {
            qrMetaUrl = fallbackURL;
          }
        }
      } catch (error) {
        console.error("Error fetching V2 contract url:", error);
        qrMetaUrl = fallbackURL;
      }
    } else {
      // For all other auctions, use V3 contract data
      qrMetaUrl = v3Settings[6]?.urlString || fallbackURL;
      
      if (qrMetaUrl === "0x") {
        qrMetaUrl = fallbackURL;
      } else {
        const contractTimestamp = Number(v3Settings[6]?.validUntil || 0);
        if (currentTimestamp > contractTimestamp) {
          qrMetaUrl = fallbackURL;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching contract url:", error);
    qrMetaUrl = fallbackURL;
  }

  // Track the click if we have valid data
  if (currentTokenId > 0) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const headersList = await headers();
      const clickSource = params.source || 'unknown';
      const ipAddress = getClientIP(headersList);
      const userAgent = headersList.get('user-agent') || '';
      const referrer = headersList.get('referer') || '';

      // Insert the click tracking record
      const { error } = await supabase
        .from('redirect_click_tracking')
        .insert({
          auction_id: currentTokenId,
          ip_address: ipAddress,
          user_agent: userAgent,
          referrer: referrer,
          click_source: clickSource
        });

      if (error) {
        console.error('Error tracking click:', error);
      }
    } catch (error) {
      console.error('Error in click tracking:', error);
    }
  }

  // Redirect to the target URL
  console.log(`Redirecting to: ${qrMetaUrl}`);
  redirect(qrMetaUrl);
}