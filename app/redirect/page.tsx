/* eslint-disable @typescript-eslint/no-explicit-any */
// app/redirect/page.tsx
import { redirect } from "next/navigation";
import { ethers } from "ethers";
import QRAuction from "@/abi/QRAuction.json"; // Adjust the path as needed

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Function to safely encode URLs, handling already percent-encoded URLs
function sanitizeUrl(url: string): string {
  try {
    // Replace any problematic characters that might cause issues in HTTP headers
    return url.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  } catch {
    return "";
  }
}

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
  
  // Create an HTML page with client-side redirect instead of using Next.js redirect
  if (qrMetaUrl && qrMetaUrl.startsWith('https://')) {
    // Sanitize the URL to remove invalid characters
    const sanitizedUrl = sanitizeUrl(qrMetaUrl);
    
    // Create an HTML response with client-side redirect
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <meta http-equiv="refresh" content="0;url=${sanitizedUrl}">
          <title>Redirecting...</title>
        </head>
        <body>
          <p>Redirecting to <a href="${sanitizedUrl}">${sanitizedUrl}</a>...</p>
          <script>
            window.location.href = "${sanitizedUrl}";
          </script>
        </body>
      </html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
  } else {
    // For fallback URL, use direct redirect since it's known to be valid
    return redirect(fallbackURL);
  }
}
