import { NextRequest } from "next/server";
import { z } from "zod";
import { sendOutbidNotification } from "@/lib/notifs";

const requestSchema = z.object({
  bidderAddress: z.string(),
  auctionId: z.number(),
});

export async function POST(request: NextRequest) {
  const requestJson = await request.json();
  const requestBody = requestSchema.safeParse(requestJson);

  if (requestBody.success === false) {
    return Response.json(
      { success: false, errors: requestBody.error.errors },
      { status: 400 }
    );
  }

  const { bidderAddress, auctionId } = requestBody.data;
  
  try {
    // Get the FID for the address using our secure API route
    const normalizedAddress = bidderAddress.toLowerCase();
    
    console.log(`Looking up Farcaster user for address: ${normalizedAddress}`);
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_HOST_URL}/api/farcaster/user-by-address?address=${encodeURIComponent(normalizedAddress)}`);
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`API error: ${data.error}`);
    }
    
    // Check if a user was found
    if (data.user && data.user.fid) {
      const user = data.user;
      
      console.log(`Found Farcaster user with FID ${user.fid} (${user.username || 'unnamed'}) for address ${normalizedAddress}`);
      
      // Send the notification
      const result = await sendOutbidNotification(user.fid, auctionId);
        
        if (result.state === "error") {
          return Response.json(
            { success: false, error: result.error },
            { status: 500 }
          );
        } else if (result.state === "rate_limit") {
          return Response.json(
            { success: false, error: "Rate limited" },
            { status: 429 }
          );
        } else if (result.state === "no_token") {
          return Response.json(
            { success: false, error: "No notification token found for user" },
            { status: 404 }
          );
        }
        
        console.log(`Sent outbid notification to FID: ${user.fid} for auction #${auctionId}`);
        return Response.json({ success: true });
    }
    
    // If we get here, no Farcaster user was found for this address
    console.log(`No Farcaster user found for address: ${normalizedAddress}`);
    return Response.json({ 
      success: true,
      message: "No Farcaster user found for this address"
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending outbid notification:", error);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
} 