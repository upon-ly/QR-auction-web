import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter is required' },
        { status: 400 }
      );
    }

    // Skip invalid usernames
    if (username === "null" || username === "undefined") {
      return NextResponse.json({ pfpUrl: null });
    }

    // Fix for specific usernames
    let processedUsername = username;
    if (username === "!217978") {
      processedUsername = "softwarecurator";
    }

    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      console.error("Missing Neynar API key");
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(processedUsername)}`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-api-key': apiKey
        }
      }
    );

    if (!response.ok) {
      // Handle different API error responses appropriately
      if (response.status === 404) {
        // User not found - return null pfp
        return NextResponse.json({ pfpUrl: null });
      } else if (response.status === 401 || response.status === 403) {
        // Authentication/authorization issues
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503 }
        );
      } else if (response.status === 429) {
        // Rate limited
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503 }
        );
      } else if (response.status >= 400 && response.status < 500) {
        // Client error - likely bad request
        return NextResponse.json(
          { error: 'Invalid request' },
          { status: 422 }
        );
      } else {
        // Server error from Neynar
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503 }
        );
      }
    }

    const data = await response.json();
    
    if (data?.user?.pfp_url) {
      return NextResponse.json({ pfpUrl: data.user.pfp_url });
    }

    return NextResponse.json({ pfpUrl: null });
    
  } catch (error) {
    console.error('Unexpected error in user-by-username:', error);
    // Only return 503 for truly unexpected errors (network issues, JSON parsing, etc.)
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
} 