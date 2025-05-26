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
        { error: 'API key not configured' },
        { status: 500 }
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
      throw new Error(`Neynar API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data?.user?.pfp_url) {
      return NextResponse.json({ pfpUrl: data.user.pfp_url });
    }

    return NextResponse.json({ pfpUrl: null });
    
  } catch (error) {
    console.error(`Error fetching Farcaster pfp for username:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch profile picture' },
      { status: 500 }
    );
  }
} 