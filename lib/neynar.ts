import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

let neynarClient: NeynarAPIClient | null = null;

export function getNeynarClient() {
  if (!neynarClient) {
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      throw new Error('Neynar API key not configured. Please set NEYNAR_API_KEY');
    }
    const config = new Configuration({ apiKey });
    neynarClient = new NeynarAPIClient(config);
    
    // Log that client was initialized
    console.log("Neynar client initialized successfully");
  }
  return neynarClient;
}

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

// Function to check if an error is a rate limit error
function isRateLimitError(error: unknown): boolean {
  // Check for HTTP 429 status code (Too Many Requests)
  if (error && typeof error === 'object') {
    // Check for Response or fetch API error with status
    if ('status' in error && error.status === 429) {
      return true;
    }
    
    // Check for error response property
    if ('response' in error && 
        error.response && 
        typeof error.response === 'object' && 
        'status' in error.response && 
        error.response.status === 429) {
      return true;
    }
  }
  
  // Check for rate limit message in error
  if (error instanceof Error && 
      (error.message.toLowerCase().includes('rate') || 
       error.message.toLowerCase().includes('limit') ||
       error.message.toLowerCase().includes('too many requests'))) {
    return true;
  }
  
  return false;
}

// Add a timestamp to rate limit logs for tracking
function formatTimestamp(): string {
  return new Date().toISOString();
}

// Server-side function to send a notification to a single user
export async function sendNotification({
  fid,
  title,
  body,
  targetUrl,
  maxRetries = 2,
  initialDelay = 5000
}: {
  fid: number;
  title: string;
  body: string;
  targetUrl?: string;
  maxRetries?: number;
  initialDelay?: number;
}): Promise<SendFrameNotificationResult> {
  // Number of attempts made (including the initial attempt)
  let attempts = 0;
  
  // Function to execute with retries
  const executeWithRetry = async (): Promise<SendFrameNotificationResult> => {
    attempts++;
    
    try {
      // Validate inputs before making API calls
      if (!fid || !Number.isInteger(fid) || fid <= 0) {
        console.warn(`[SendNotif] Invalid FID provided: ${fid}`);
        return { state: "error", error: "Invalid FID provided" };
      }
      
      // Validate title and body are not empty and within limits
      if (!title || title.length > 32) {
        console.warn(`[SendNotif] Invalid title: ${title ? 'Too long (' + title.length + ' chars)' : 'Empty'}`);
        return { state: "error", error: "Title must be 1-32 characters" };
      }
      
      if (!body || body.length > 128) {
        console.warn(`[SendNotif] Invalid body: ${body ? 'Too long (' + body.length + ' chars)' : 'Empty'}`);
        return { state: "error", error: "Body must be 1-128 characters" };
      }
      
      console.log(`[SendNotif] Initializing Neynar client for FID ${fid} (attempt ${attempts}/${maxRetries + 1})`);
      const client = getNeynarClient();
      
      const targetFids = [fid];
      const notification = {
        title,
        body,
        target_url: targetUrl || process.env.NEXT_PUBLIC_HOST_URL || "",
      };
      
      // Log the notification details
      console.log(`[SendNotif] Sending notification to FID ${fid}:`, { 
        title,
        body,
        target_url: notification.target_url
      });

      console.log(`[SendNotif] Calling Neynar API publishFrameNotifications`);
      const result = await client.publishFrameNotifications({ 
        targetFids, 
        notification 
      });
      
      console.log(`[SendNotif] Neynar API response:`, { 
        deliveries: result.notification_deliveries.length,
        targetFids: targetFids.length
      });

      // Check for successful delivery
      if (result.notification_deliveries.length > 0) {
        console.log(`[SendNotif] ✅ Successfully delivered notification to FID ${fid}`);
        return { state: "success" };
      } 
      
      // No deliveries means no notification token
      if (result.notification_deliveries.length === 0) {
        console.warn(`[SendNotif] ⚠️ No notification token found for FID ${fid}`);
        return { state: "no_token" };
      }
      
      // Default error case
      console.error(`[SendNotif] ❌ Unknown error with notification for FID ${fid}`);
      return { state: "error", error: result || "Unknown error" };
    } catch (error) {
      // Check if this is a rate limit error and we should retry
      if (isRateLimitError(error) && attempts <= maxRetries) {
        // Calculate delay with exponential backoff
        const delay = initialDelay * Math.pow(2, attempts - 1);
        console.warn(`[SendNotif] ⚠️ [${formatTimestamp()}] RATE LIMITED (attempt ${attempts}/${maxRetries + 1}). Retrying in ${delay/1000} seconds. FID: ${fid}`);
        
        // Wait for the delay period
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the operation
        return executeWithRetry();
      }
      
      console.error("[SendNotif] ❌ Error sending notification:", error);
      
      // Enhanced error logging
      if (error instanceof Error) {
        console.error("[SendNotif] Error details:", {
          message: error.message,
          name: error.name
        });
        
        if ('response' in error && error.response) {
          try {
            const responseData = (error.response as {data?: unknown}).data;
            console.error("[SendNotif] Response data:", JSON.stringify(responseData, null, 2));
          } catch (jsonError) {
            console.error("[SendNotif] Could not parse response data", jsonError);
          }
        }
      }
      
      // Check if the error message suggests rate limiting
      if (isRateLimitError(error)) {
        console.warn(`[SendNotif] ⚠️ [${formatTimestamp()}] RATE LIMITED - Max retries exceeded. FID: ${fid}, Attempts: ${attempts}/${maxRetries + 1}`);
        return { state: "rate_limit" };
      }
      
      return { state: "error", error };
    }
  };
  
  // Start the retry process
  return executeWithRetry();
}

// Server-side function to send a notification to multiple users (batched in groups of 100)
export async function sendBulkNotification({
  fids,
  title,
  body,
  targetUrl,
  maxRetries = 2,
  initialDelay = 5000
}: {
  fids: number[];
  title: string;
  body: string;
  targetUrl?: string;
  maxRetries?: number;
  initialDelay?: number;
}): Promise<SendFrameNotificationResult> {
  try {
    // Validate inputs before making API calls
    if (!fids || !Array.isArray(fids) || fids.length === 0) {
      console.warn('No valid FIDs provided for bulk notification');
      return { state: "error", error: "No valid FIDs provided" };
    }

    // Filter out any invalid FIDs (must be positive integers)
    const validFids = fids.filter(fid => 
      Number.isInteger(fid) && fid > 0
    );

    if (validFids.length === 0) {
      console.warn('No valid FIDs after filtering');
      return { state: "error", error: "No valid FIDs after filtering" };
    }

    const client = getNeynarClient();
    
    // Validate title and body are not empty and within limits
    if (!title || title.length > 32) {
      return { state: "error", error: "Title must be 1-32 characters" };
    }
    
    if (!body || body.length > 128) {
      return { state: "error", error: "Body must be 1-128 characters" };
    }
    
    const notification = {
      title,
      body,
      target_url: targetUrl || process.env.NEXT_PUBLIC_HOST_URL || "",
    };

    // Log the notification payload
    console.log('Notification payload:', { ...notification, targetCount: validFids.length });

    // Neynar can only send to 100 users at a time, so we need to batch the requests
    const BATCH_SIZE = 100;
    const batches = [];
    
    // Create batches of up to 100 FIDs
    for (let i = 0; i < validFids.length; i += BATCH_SIZE) {
      batches.push(validFids.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Sending notification "${title}" to ${validFids.length} users in ${batches.length} batches`);
    
    let successCount = 0;
    let errorCount = 0;
    let noTokenCount = 0;
    
    // Process each batch with retry logic
    for (const batch of batches) {
      // Number of attempts made for this batch
      let attempts = 0;
      let batchProcessed = false;
      
      // Process batch with retries
      while (!batchProcessed && attempts <= maxRetries) {
        attempts++;
        
        try {
          console.log(`Processing batch of ${batch.length} users (attempt ${attempts}/${maxRetries + 1})`);
          
          const result = await client.publishFrameNotifications({ 
            targetFids: batch, 
            notification 
          });
          
          console.log(`Batch result:`, {
            deliveries: result.notification_deliveries.length,
            total: batch.length
          });
          
          successCount += result.notification_deliveries.length;
          noTokenCount += batch.length - result.notification_deliveries.length;
          batchProcessed = true;
        } catch (batchError) {
          // Check if this is a rate limit error and we should retry
          const isRateLimitHit = isRateLimitError(batchError);
          
          if (isRateLimitHit && attempts <= maxRetries) {
            // Calculate delay with exponential backoff
            const delay = initialDelay * Math.pow(2, attempts - 1);
            console.warn(`⚠️ [${formatTimestamp()}] RATE LIMITED (batch attempt ${attempts}/${maxRetries + 1}). Retrying in ${delay/1000} seconds. Batch size: ${batch.length}`);
            
            // Wait for the delay period
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // We'll retry in the next loop iteration
            continue;
          }
          
          console.error("Error processing batch:", batchError);
          
          // Log more detailed error information
          if (batchError instanceof Error) {
            console.error("Error details:", {
              message: batchError.message,
              name: batchError.name
            });
            
            if ('response' in batchError && batchError.response) {
              try {
                const responseData = (batchError.response as {data?: unknown}).data;
                console.error("Response data:", JSON.stringify(responseData, null, 2));
              } catch (jsonError) {
                console.error("Could not parse response data:", jsonError);
              }
            }
          }
          
          errorCount++;
          batchProcessed = true;
          
          // Check if this is a rate limit error and we should retry
          if (isRateLimitHit && attempts > maxRetries) {
            console.warn(`⚠️ [${formatTimestamp()}] RATE LIMITED - Max retries exceeded for batch. Batch size: ${batch.length}, Attempts: ${attempts}/${maxRetries + 1}`);
            return { state: "rate_limit" };
          }
        }
      }
    }
    
    // Determine the overall result based on success/failure counts
    if (successCount > 0) {
      console.log(`Successfully sent notifications to ${successCount} out of ${validFids.length} users`);
      return { state: "success" };
    } else if (noTokenCount > 0 && errorCount === 0) {
      console.log(`No notification tokens found for any of the ${validFids.length} users`);
      return { state: "no_token" };
    } else {
      console.error(`Failed to send any notifications to ${validFids.length} users`);
      return { state: "error", error: "Failed to send any notifications" };
    }
  } catch (error) {
    console.error("Error sending bulk notification:", error);
    
    // Check if the error message suggests rate limiting
    if (isRateLimitError(error)) {
      return { state: "rate_limit" };
    }
    
    return { state: "error", error };
  }
}

// Utility function to get all notification tokens from Neynar
export async function getNotificationTokens(options?: {
  limit?: number;
  fids?: number[];
  cursor?: string;
}) {
  // Define token type to fix TypeScript errors
  type NotificationToken = {
    object: string;
    url: string;
    token: string;
    status: string;
    fid: number;
    created_at: string;
    updated_at: string;
  };
  
  try {
    console.log(`[GetTokens] Fetching all notification tokens with pagination...`);
    
    // Get API key
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      throw new Error('Neynar API key not configured');
    }
    
    // Initialize variables for pagination
    let cursor: string | null = options?.cursor || null;
    let hasMore = true;
    let pageCount = 0;
    let allTokens: NotificationToken[] = [];
    
    // Fetch all pages of tokens
    while (hasMore) {
      pageCount++;
      console.log(`[GetTokens] Fetching page ${pageCount} of notification tokens${cursor ? ' with cursor: ' + cursor : ''}`);
      
      // Build URL with query parameters
      let url = 'https://api.neynar.com/v2/farcaster/frame/notification_tokens?limit=100';
      
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`;
      }
      
      if (options?.fids && options.fids.length > 0) {
        url += `&fids=${options.fids.join(',')}`;
      }
      
      // Make direct API call instead of using SDK
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-api-key': apiKey
        }
      });
      
      // Check if response is ok
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      // Parse response
      const result = await response.json();
      
      // Process the tokens from this page
      if (result && result.notification_tokens && result.notification_tokens.length > 0) {
        console.log(`[GetTokens] Page ${pageCount}: Found ${result.notification_tokens.length} tokens`);
        
        // Add tokens from this page to our collection
        allTokens = [...allTokens, ...result.notification_tokens];
        
        // Update cursor for next page
        if (result.next && result.next.cursor) {
          cursor = result.next.cursor;
          console.log(`[GetTokens] Next cursor found: ${cursor}`);
          
          // Sleep briefly to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.log(`[GetTokens] No next cursor, reached end of results`);
          hasMore = false;
        }
      } else {
        console.log(`[GetTokens] No tokens found in current page, stopping pagination`);
        hasMore = false;
      }
    }
    
    // Generate final result with the combined tokens
    const finalResult = {
      notification_tokens: allTokens,
      next_cursor: null
    };
    
    // Clean, focused logging
    if (finalResult && finalResult.notification_tokens) {
      // Count tokens by status
      const statusCounts: Record<string, number> = {};
      const enabledFids = new Set<number>();
      
      finalResult.notification_tokens.forEach((token: NotificationToken) => {
        if (token.status) {
          statusCounts[token.status] = (statusCounts[token.status] || 0) + 1;
          
          if (token.status === "enabled") {
            enabledFids.add(token.fid);
          }
        }
      });
      
      console.log(`[GetTokens] Completed pagination, fetched ${finalResult.notification_tokens.length} total tokens from ${pageCount} pages`);
      console.log(`[GetTokens] Token status counts: ${Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`).join(', ')}`);
      console.log(`[GetTokens] Found ${enabledFids.size} unique FIDs with enabled tokens`);
    } else {
      console.log(`[GetTokens] No notification tokens received from API`);
    }
    
    return finalResult;
  } catch (error) {
    console.error("[GetTokens] Error fetching notification tokens:", error);
    if (error instanceof Error) {
      console.error("[GetTokens] Error details:", {
        message: error.message,
        name: error.name
      });
    }
    return null;
  }
}