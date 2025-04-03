import { NextRequest } from "next/server";
import { sendWelcomeNotification } from "@/lib/notifs";

/**
 * API endpoint to send a welcome notification to a user
 */
export async function GET(request: NextRequest) {
  // Extract FID from the query string
  const url = new URL(request.url);
  const fidParam = url.searchParams.get('fid');
  
  if (!fidParam) {
    return Response.json(
      { success: false, error: "Missing FID parameter" },
      { status: 400 }
    );
  }
  
  // Convert FID to number
  const fid = parseInt(fidParam, 10);
  
  if (isNaN(fid) || fid <= 0) {
    return Response.json(
      { success: false, error: "Invalid FID parameter" },
      { status: 400 }
    );
  }
  
  console.log(`Sending welcome notification to FID ${fid}`);
  
  try {
    // Use the Neynar client to send the notification
    const result = await sendWelcomeNotification(fid);
    
    // Return the appropriate response based on the result
    return Response.json({ success: true, result });
  } catch (error) {
    console.error("Error sending welcome notification:", error);
    return Response.json(
      { success: false, error: "Failed to send notification" },
      { status: 500 }
    );
  }
} 