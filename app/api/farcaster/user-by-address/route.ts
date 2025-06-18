import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    
    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter is required' },
        { status: 400 }
      );
    }

    // Validate Ethereum address format
    if (!address.startsWith('0x') || address.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      console.error("Missing Neynar API key");
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const normalizedAddress = address.toLowerCase();
    
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${normalizedAddress}&address_types=verified_address`,
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
        // User not found - return null user (same as empty result)
        return NextResponse.json({ user: null });
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
    
    // Process API response
    if (data && data[normalizedAddress] && data[normalizedAddress].length > 0) {
      const user = data[normalizedAddress][0];
      const farcasterUser = {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        isVerified: true
      };
      
      return NextResponse.json({ user: farcasterUser });
    }

    // No user found
    return NextResponse.json({ user: null });
    
  } catch (error) {
    console.error('Unexpected error in user-by-address:', error);
    // Only return 500 for truly unexpected errors (network issues, JSON parsing, etc.)
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
} 