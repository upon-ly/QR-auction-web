import { NextRequest, NextResponse } from 'next/server';

const RETRY_ENDPOINT_SECRET = process.env.RETRY_ENDPOINT_SECRET
const HOST_URL = process.env.NEXT_PUBLIC_HOST_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const { settledAuctionId, newAuctionId } = await req.json();
    
    if (!settledAuctionId) {
      return NextResponse.json({ success: false, error: 'Settled auction ID required' }, { status: 400 });
    }

    console.log(`Auction settlement webhook triggered: ${settledAuctionId} -> ${newAuctionId}`);

    // Trigger the batch retry for the settled auction after a short delay
    // This allows the settlement transaction to be fully processed first
    const auctionToRetry = settledAuctionId - 1;
    setTimeout(async () => {
      try {
        console.log(`Triggering batch retry for auction ${auctionToRetry} (settled auction ${settledAuctionId})`);
        
        const retryResponse = await fetch(`${HOST_URL}/api/auction/settled/retry-failures`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RETRY_ENDPOINT_SECRET}`
          },
          body: JSON.stringify({
            auctionId: auctionToRetry
          })
        });

        const retryResult = await retryResponse.json();
        
        if (retryResult.success) {
          console.log(`Batch retry completed for auction ${auctionToRetry}:`, {
            processed: retryResult.processed,
            successful: retryResult.successful,
            failed: retryResult.failed
          });
        } else {
          console.error(`Batch retry failed for auction ${auctionToRetry}:`, retryResult.error);
        }
      } catch (error) {
        console.error(`Error triggering batch retry for auction ${auctionToRetry}:`, error);
      }
    }, 10000); // 10 second delay to ensure settlement is processed

    return NextResponse.json({
      success: true,
      message: `Batch retry scheduled for auction ${auctionToRetry} (settled auction ${settledAuctionId})`,
      settledAuctionId,
      newAuctionId,
      auctionToRetry
    });

  } catch (error) {
    console.error('Auction settlement webhook error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 