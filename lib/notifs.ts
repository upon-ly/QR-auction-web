import { sendNotification, sendBulkNotification } from './neynar';

type NotificationParams = {
  title: string;
  body: string;
  targetUrl?: string;
};

/**
 * Send a welcome notification to a user when they enable notifications
 * This is triggered when a user adds the frame with notifications enabled
 */
export async function sendWelcomeNotification(fid: number) {
  console.log(`Sending welcome notification to FID ${fid}`);
  return await sendNotification({
    fid,
    title: "Welcome to $QR",
    body: "Bid for the QR to point to your site next!",
    targetUrl: `${process.env.NEXT_PUBLIC_HOST_URL}`
  });
}

/**
 * Send an outbid notification to a user
 * This is triggered when a user's bid is surpassed by another user
 */
export async function sendOutbidNotification(fid: number, auctionId: number) {
  console.log(`Sending outbid notification to FID ${fid} for auction #${auctionId}`);
  return await sendNotification({
    fid,
    title: "You've been outbid!",
    body: "Bid quickly to regain the lead before the auction ends",
    targetUrl: `${process.env.NEXT_PUBLIC_HOST_URL}/auction/${auctionId}`
  });
}

/**
 * Send a notification to the winner of an auction
 * This is triggered when an auction is settled and sent only to the winner
 */
export async function sendAuctionWonNotification(fid: number, auctionId: number) {
  console.log(`Sending auction won notification to FID ${fid} for auction #${auctionId}`);
  
  // Title is fixed and within 32 character limit (27 chars)
  const title = "You won today's auction!";
  
  // Ensure the body is within 128 character limit
  const body = "The QR now points to your site for the next 24 hours";
  
  if (title.length > 32) {
    console.warn(`[AuctionWon] Title exceeds 32 characters: "${title}" (${title.length})`);
  }
  
  if (body.length > 128) {
    console.warn(`[AuctionWon] Body exceeds 128 characters: "${body}" (${body.length})`);
  }
  
  return await sendNotification({
    fid,
    title,
    body,
    targetUrl: `${process.env.NEXT_PUBLIC_HOST_URL}/auction/${auctionId}`
  });
}

/**
 * Send a notification to all users when an auction is settled
 * This broadcasts the winner to all users who have enabled notifications
 */
export async function sendAuctionSettledNotification(fids: number[], winnerName: string, auctionId: number) {
  console.log(`Sending auction settled notification about ${winnerName} to ${fids.length} users for auction #${auctionId}`);
  
  // Ensure total title length is under 32 characters
  let title = `${winnerName} won Auction #${auctionId}!`;
  
  // If title is too long, truncate the winner name
  if (title.length > 32) {
    const maxNameLength = 32 - ` won Auction #${auctionId}!`.length;
    const truncatedName = winnerName.substring(0, maxNameLength - 1) + '…';
    title = `${truncatedName} won Auction #${auctionId}!`;
    console.log(`Truncated notification title to "${title}" (${title.length} chars)`);
  }
  
  return await sendBulkNotification({
    fids,
    title,
    body: "Click here to check out the winning link",
    targetUrl: `${process.env.NEXT_PUBLIC_HOST_URL}/auction/${auctionId}`
  });
}

/**
 * Generic function to send frame notification to a single user
 */
export async function sendFrameNotification({
  fid,
  title,
  body,
  targetUrl
}: {
  fid: number;
} & NotificationParams) {
  return await sendNotification({ fid, title, body, targetUrl });
}

/**
 * Generic function to send frame notification to multiple users
 * Automatically handles batching in groups of 100
 */
export async function sendBulkFrameNotification({
  fids,
  title,
  body,
  targetUrl
}: {
  fids: number[];
} & NotificationParams) {
  return await sendBulkNotification({ fids, title, body, targetUrl });
}
