import { NextRequest } from "next/server";

/**
 * Webhook handler for frame events from Neynar
 * 
 * When using Neynar with API key and client ID, Neynar handles all frame events
 * automatically. This endpoint exists only to satisfy the webhook requirement.
 */
export async function POST(request: NextRequest) {
  try {
    // Log that we received a webhook request
    console.log("Received webhook request from Neynar", { 
      url: request.url,
      method: request.method 
    });
    
    // When using Neynar (which we are), we don't need to handle frame events
    // here as they are handled automatically by Neynar's system
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
