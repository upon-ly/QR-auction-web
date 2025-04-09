import { NextRequest } from "next/server";
import { z } from "zod";
import { getNotificationTokens } from "@/lib/neynar";
import { sendAuctionSettledNotification } from "@/lib/notifs";

// Define NotificationToken type to fix TypeScript errors
type NotificationToken = {
  object: string;
  url: string;
  token: string;
  status: string;
  fid: number;
  created_at: string;
  updated_at: string;
};

const requestSchema = z.object({
  auctionId: z.number(),
  winnerAddress: z.string(),
  winnerName: z.string(),
  excludeFid: z.number().nullable().optional(),
});

/**
 * Endpoint to send broadcast notifications when an auction is settled
 * This sends a notification to all users about who won the auction
 */
export async function POST(request: NextRequest) {
  console.log(`[AuctionSettled] 📣 Received auction settled notification request`);
  
  const requestJson = await request.json();
  console.log(`[AuctionSettled] Request payload:`, requestJson);
  
  const requestBody = requestSchema.safeParse(requestJson);

  if (requestBody.success === false) {
    console.error(`[AuctionSettled] ❌ Invalid request format:`, requestBody.error.errors);
    return Response.json(
      { success: false, errors: requestBody.error.errors },
      { status: 400 }
    );
  }

  const { auctionId, winnerAddress, winnerName } = requestBody.data;
  
  try {
    // Check if this is a zero address winner (auction with no bids)
    const isZeroAddress = winnerAddress === '0x0000000000000000000000000000000000000000';
    
    if (isZeroAddress) {
      console.log(`[AuctionSettled] Auction #${auctionId} settled with no bids (zero address winner). Skipping notification.`);
      return Response.json({ 
        success: true,
        message: "Skipped notification for zero address winner"
      });
    }
    
    console.log(`[AuctionSettled] Processing broadcast notification for auction #${auctionId} won by ${winnerName}`);
    
    // 1. Get all notification tokens (now using improved pagination)
    console.log(`[AuctionSettled] Fetching notification tokens from Neynar...`);
    const tokensResponse = await getNotificationTokens();
    
    // Log token information
    console.log(`[AuctionSettled] Got notification tokens: ${tokensResponse?.notification_tokens?.length || 0} tokens found through pagination`);
    
    // 2. Send auction settled notification to all users
    if (tokensResponse && tokensResponse.notification_tokens && tokensResponse.notification_tokens.length > 0) {
      // Extract all FIDs, filter out undefined values, ensure uniqueness, and only use enabled tokens
      const enabledTokens = tokensResponse.notification_tokens.filter((token: NotificationToken) => token.status === "enabled");
      console.log(`[AuctionSettled] Found ${enabledTokens.length} enabled tokens out of ${tokensResponse.notification_tokens.length} total tokens`);
      
      const fids = [...new Set(
        enabledTokens
          .map((token: NotificationToken) => token.fid)
          .filter((fid: number): fid is number => Number.isInteger(fid) && fid > 0)
      )];
      
      console.log(`[AuctionSettled] Found ${fids.length} unique FIDs from enabled tokens`);
      
      if (fids.length > 0) {
        // If we have a FID to exclude (usually the winner), filter it out
        let filteredFids = fids;
        if (requestBody.data.excludeFid) {
          const excludeFid = requestBody.data.excludeFid;
          filteredFids = fids.filter(fid => fid !== excludeFid);
          console.log(`[AuctionSettled] Excluding FID ${excludeFid} from broadcast notification`);
          console.log(`[AuctionSettled] Will notify ${filteredFids.length} users after exclusion`);
        }
        
        console.log(`[AuctionSettled] Sending auction settled notification to ${filteredFids.length} unique users with valid FIDs`);
        
        // Send auction settled notification to all filtered users
        const settledResult = await sendAuctionSettledNotification(filteredFids as number[], winnerName, auctionId);
        
        if (settledResult.state === "success") {
          console.log(`[AuctionSettled] ✅ Sent auction settled notification for auction #${auctionId} to ${filteredFids.length} users`);
          return Response.json({ 
            success: true,
            message: `Successfully sent broadcast notification to ${filteredFids.length} users`
          });
        } else {
          console.error(`[AuctionSettled] ❌ Failed to send auction settled notification: ${settledResult.state}`);
          return Response.json(
            { success: false, error: `Failed to send: ${settledResult.state}` },
            { status: 500 }
          );
        }
      } else {
        console.log(`[AuctionSettled] No valid FIDs found for sending notifications`);
        return Response.json({ 
          success: false,
          message: "No valid FIDs found for sending notifications"
        });
      }
    } else {
      console.log(`[AuctionSettled] No notification tokens found or tokens array is empty`);
      return Response.json({ 
        success: false,
        message: "No notification tokens available"
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[AuctionSettled] ❌ Error sending auction settled notifications:", error);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
} 