import { NextRequest, NextResponse } from 'next/server';

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

// Type definitions for Neynar API
interface NotificationFilters {
  exclude_fids?: number[];
  following_fid?: number;
  minimum_user_score?: number;
  near_location?: {
    latitude: number;
    longitude: number;
    address?: {
      city?: string;
      state?: string;
      state_code?: string;
      country?: string;
      country_code?: string;
    };
    radius: number;
  };
}

interface NotificationData {
  title: string;
  body: string;
  target_url?: string;
  uuid: string;
}

interface NeynarNotificationPayload {
  target_fids?: number[];
  filters?: NotificationFilters;
  notification: NotificationData;
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const address = authHeader.substring(7).toLowerCase();
    if (!ADMIN_ADDRESSES.includes(address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { target_fids, filters, notification } = body;

    // Validate required fields
    if (!notification || !notification.title || !notification.body) {
      return NextResponse.json({ 
        error: 'Missing required notification fields (title, body)' 
      }, { status: 400 });
    }

    // Validate character limits per Farcaster specification
    if (notification.title.length > 32) {
      return NextResponse.json({ 
        error: 'Title exceeds maximum length of 32 characters' 
      }, { status: 400 });
    }
    
    if (notification.body.length > 128) {
      return NextResponse.json({ 
        error: 'Body exceeds maximum length of 128 characters' 
      }, { status: 400 });
    }
    
    if (notification.target_url && notification.target_url.length > 1024) {
      return NextResponse.json({ 
        error: 'Target URL exceeds maximum length of 1024 characters' 
      }, { status: 400 });
    }

    // Validate UUID format
    if (!notification.uuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notification.uuid)) {
      return NextResponse.json({ 
        error: 'Invalid UUID format' 
      }, { status: 400 });
    }

    // Get Neynar API key
    const neynarApiKey = process.env.NEYNAR_API_KEY;
    if (!neynarApiKey) {
      return NextResponse.json({ 
        error: 'Neynar API key not configured' 
      }, { status: 500 });
    }

    // Prepare the payload for Neynar API
    const neynarPayload: NeynarNotificationPayload = {
      notification: {
        title: notification.title,
        body: notification.body,
        uuid: notification.uuid
      }
    };

    // Add target_url if provided
    if (notification.target_url) {
      neynarPayload.notification.target_url = notification.target_url;
    }

    // Add target_fids if provided
    if (target_fids && Array.isArray(target_fids)) {
      neynarPayload.target_fids = target_fids;
    } else {
      // Default to empty array if not provided (sends to all mini app users)
      neynarPayload.target_fids = [];
    }

    // Add filters if provided
    if (filters && Object.keys(filters).length > 0) {
      neynarPayload.filters = filters;
    }

    // Send request to Neynar API
    const neynarResponse = await fetch('https://api.neynar.com/v2/farcaster/frame/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': neynarApiKey
      },
      body: JSON.stringify(neynarPayload)
    });

    const responseData = await neynarResponse.json();

    if (!neynarResponse.ok) {
      console.error('Neynar API error:', responseData);
      return NextResponse.json({ 
        error: 'Failed to send notification',
        details: responseData
      }, { status: neynarResponse.status });
    }

    // Return success response
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error sending Farcaster notification:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 