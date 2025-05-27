import { NextRequest, NextResponse } from 'next/server';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const NEYNAR_API_URL = 'https://api.neynar.com/v2';

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
];

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`[${requestId}] Cast analytics request started`);
    
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const address = authHeader?.replace('Bearer ', '');
    
    if (!address || !ADMIN_ADDRESSES.includes(address.toLowerCase())) {
      console.log(`[${requestId}] Unauthorized access attempt from ${address}`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { castHash } = await request.json();
    
    if (!castHash) {
      console.log(`[${requestId}] Missing cast hash in request`);
      return NextResponse.json(
        { error: 'Cast hash is required' },
        { status: 400 }
      );
    }

    // Validate cast hash format (should be 0x followed by 40 hex characters)
    const castHashRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!castHashRegex.test(castHash)) {
      console.log(`[${requestId}] Invalid cast hash format: ${castHash}`);
      return NextResponse.json(
        { error: 'Invalid cast hash format. Expected 0x followed by 40 hex characters.' },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Analyzing cast engagement for hash: ${castHash}`);

    // Fetch likes and recasts from Neynar with pagination
    const fetchAllReactions = async (type: 'likes' | 'recasts'): Promise<Array<{ user: { fid: number } }>> => {
      const allReactions: Array<{ user: { fid: number } }> = [];
      let cursor: string | null = null;
      let pageCount = 0;
      const maxPages = 50; // Increased from 10 for better coverage

      do {
        const url: string = `${NEYNAR_API_URL}/farcaster/reactions/cast?hash=${castHash}&types=${type}&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
        
        const response: Response = await fetch(url, {
          headers: { 'api_key': NEYNAR_API_KEY }
        });

        if (!response.ok) {
          let errorMessage = `Failed to fetch ${type}: ${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage += ` - ${errorData.message}`;
            }
            console.log(`[${requestId}] Neynar API error details:`, errorData);
          } catch {
            // If we can't parse error response, use the status text
          }
          console.error(`[${requestId}] ${errorMessage}`);
          throw new Error(errorMessage);
        }

        const data: { reactions?: Array<{ user: { fid: number } }>; next?: { cursor: string } } = await response.json();
        
        if (data.reactions && data.reactions.length > 0) {
          allReactions.push(...data.reactions);
        }
        
        cursor = data.next?.cursor || null;
        pageCount++;
        
        console.log(`[${requestId}] Fetched page ${pageCount} of ${type}: ${data.reactions?.length || 0} reactions (total: ${allReactions.length})`);
        
      } while (cursor && pageCount < maxPages);

      if (pageCount >= maxPages) {
        console.warn(`[${requestId}] Hit max pages limit (${maxPages}) for ${type}, may have incomplete data`);
      }

      return allReactions;
    };

    // Fetch both likes and recasts
    const [likes, recasts] = await Promise.all([
      fetchAllReactions('likes'),
      fetchAllReactions('recasts')
    ]);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Analysis complete in ${duration}ms: ${likes.length} likes, ${recasts.length} recasts`);

    // Extract FIDs from reactions
    const likedFids = likes.map(r => r.user.fid);
    const recastedFids = recasts.map(r => r.user.fid);

    return NextResponse.json({
      success: true,
      data: {
        castHash,
        totalLikes: likes.length,
        totalRecasts: recasts.length,
        likedFids,
        recastedFids,
        timestamp: new Date().toISOString(),
        requestId,
        processingTimeMs: duration
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error in cast-analytics API (${duration}ms):`, error);
    
    // More specific error messages
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to fetch data from Farcaster network. Please try again.';
        statusCode = 503;
      } else if (error.message.includes('Invalid cast hash')) {
        errorMessage = error.message;
        statusCode = 400;
      } else {
        errorMessage = `Analysis failed: ${error.message}`;
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        requestId,
        timestamp: new Date().toISOString()
      },
      { status: statusCode }
    );
  }
} 