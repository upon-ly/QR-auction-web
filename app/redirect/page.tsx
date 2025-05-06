/* eslint-disable @typescript-eslint/no-explicit-any */
// app/redirect/page.tsx
import { redirect } from "next/navigation";
import { ethers } from "ethers";
import QRAuctionV3ABI from "@/abi/QRAuctionV3.json"; 
import QRAuctionV2ABI from "@/abi/QRAuctionV2.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RedirectPage() {
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
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const fallbackURL = process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string;

  try {
    // Get current auction ID from V3 contract to check if we're on auction #62
    const v3Settings = await v3Contract.settings();
    const v3Auction = await v3Contract.auction();
    const currentTokenId = Number(v3Auction.tokenId);
    
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

  redirect(qrMetaUrl);

  return <p>Redirecting...</p>;
}