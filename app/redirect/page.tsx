/* eslint-disable @typescript-eslint/no-explicit-any */
// app/redirect/page.tsx
import { redirect } from "next/navigation";
import { ethers } from "ethers";
import QRAuction from "@/abi/QRAuction.json"; // Adjust the path as needed

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RedirectPage() {
  const provider = new ethers.JsonRpcProvider(
    `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
  );

  // The contract address from your environment variable
  const contractAddress = process.env.NEXT_PUBLIC_QRAuction as string;

  // Instantiate the contract using its ABI and provider
  const contract = new ethers.Contract(
    contractAddress,
    QRAuction.abi,
    provider
  );

  let targetData: any;
  let qrMetaUrl: string;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const fallbackURL = process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string;

  try {
    targetData = await contract.settings();
    qrMetaUrl = targetData[6]?.urlString || fallbackURL;

    if (qrMetaUrl === "0x") {
      qrMetaUrl = fallbackURL;
    } else {
      const contractTimestamp = Number(targetData[6]?.validUntil || 0);

      if (currentTimestamp <= contractTimestamp) {
        qrMetaUrl = targetData[6]?.urlString || fallbackURL;
      } else {
        qrMetaUrl = fallbackURL;
      }
    }
  } catch {
    qrMetaUrl = fallbackURL;
  }

  // Process the URL to ensure it's valid for HTTP headers
  try {
    // Handle special characters and invalid URLs
    const processedUrl = new URL(qrMetaUrl).toString();
    return redirect(processedUrl);
  } catch {
    // If URL parsing fails, use the fallback
    return redirect(fallbackURL);
  }
}