/* eslint-disable @typescript-eslint/no-explicit-any */
// app/redirect/page.tsx
import { NextResponse } from "next/server";
import { ethers } from "ethers";
import QRAuction from "@/abi/QRAuction.json"; // Adjust the path as needed

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper function to safely encode URLs
function encodeUrlSafely(url: string): string {
  try {
    // Only encode if it's not already encoded
    // This checks for percent encoding patterns
    if (/%[0-9A-F]{2}/i.test(url)) {
      return url;
    }
    
    // For URLs with Unicode characters, encode each part separately
    const [baseUrl, ...queryParts] = url.split('?');
    if (queryParts.length === 0) {
      return encodeURI(url);
    }
    
    const query = queryParts.join('?');
    return `${encodeURI(baseUrl)}?${encodeURIComponent(query)}`;
  } catch {
    return url;
  }
}

export default async function RedirectPage() {
  // Get the contract URL from blockchain or use fallback
  const provider = new ethers.JsonRpcProvider(
    `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
  );

  const contractAddress = process.env.NEXT_PUBLIC_QRAuction as string;
  const contract = new ethers.Contract(
    contractAddress,
    QRAuction.abi,
    provider
  );

  let qrMetaUrl: string;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const fallbackURL = process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string;

  try {
    const targetData = await contract.settings();
    qrMetaUrl = targetData[6]?.urlString || fallbackURL;

    if (qrMetaUrl === "0x") {
      qrMetaUrl = fallbackURL;
    } else {
      const contractTimestamp = Number(targetData[6]?.validUntil || 0);
      if (currentTimestamp > contractTimestamp) {
        qrMetaUrl = fallbackURL;
      }
    }
  } catch {
    qrMetaUrl = fallbackURL;
  }

  // For the specific problematic URL
  const mediumUrl = "https://medium.com/@basedfrocarmy/%E1%97%B7%E1%97%A9%E1%94%95e%E1%97%AA-%E1%96%B4%E1%96%87o%E1%91%95-73f8452bc796";
  if (qrMetaUrl.includes("medium.com/@basedfrocarmy")) {
    return NextResponse.redirect(mediumUrl);
  }

  // For any other URL, use proper encoding to handle Unicode characters
  const encodedUrl = encodeUrlSafely(qrMetaUrl);
  return NextResponse.redirect(encodedUrl);
}
