import { NextRequest } from "next/server";
import { z } from "zod";
import { sendAuctionWonNotification } from "@/lib/notifs";

const requestSchema = z.object({
  fid: z.number(),
  auctionId: z.number(),
});

/**
 * Endpoint to send a notification to the auction winner
 * This sends a special notification only to the winner of the auction
 */
export async function POST(request: NextRequest) {
  console.log(`[AuctionWon] 🏆 Received auction won notification request`);
  
  try {
    const requestJson = await request.json();
    console.log(`[AuctionWon] Request payload:`, requestJson);
    
    const requestBody = requestSchema.safeParse(requestJson);

    if (requestBody.success === false) {
      console.error(`[AuctionWon] ❌ Invalid request format:`, requestBody.error.errors);
      return Response.json(
        { success: false, errors: requestBody.error.errors },
        { status: 400 }
      );
    }

    const { fid, auctionId } = requestBody.data;
    
    console.log(`[AuctionWon] Sending winner notification to FID ${fid} for auction #${auctionId}`);
    console.log(`[AuctionWon] Calling sendAuctionWonNotification function`);
    
    const result = await sendAuctionWonNotification(fid, auctionId);
    console.log(`[AuctionWon] Function returned result:`, result);

    if (result.state === "error") {
      console.error(`[AuctionWon] ❌ Error sending winner notification:`, result.error);
      return Response.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    } else if (result.state === "rate_limit") {
      console.warn(`[AuctionWon] ⚠️ Rate limited when sending winner notification`);
      return Response.json(
        { success: false, error: "Rate limited" },
        { status: 429 }
      );
    } else if (result.state === "no_token") {
      console.warn(`[AuctionWon] ⚠️ No notification token found for winner (FID: ${fid})`);
      return Response.json(
        { success: false, error: "No notification token found for user" },
        { status: 404 }
      );
    }

    console.log(`[AuctionWon] ✅ Successfully sent winner notification to FID ${fid} for auction #${auctionId}`);
    return Response.json({ 
      success: true,
      message: `Successfully sent winner notification to FID ${fid}`
    });
  } catch (error) {
    console.error(`[AuctionWon] ❌ Unexpected error:`, error);
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
} 