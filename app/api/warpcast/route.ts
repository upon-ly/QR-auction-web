import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const hash = request.nextUrl.searchParams.get('hash');
  
  if (!url && !hash) {
    return NextResponse.json(
      { error: 'Either URL or hash is required' },
      { status: 400 }
    );
  }

  try {
    let endpoint: string;
    
    if (url) {
      // Fetch cast by URL
      endpoint = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(url)}&type=url`;
    } else {
      // Fetch cast by hash
      endpoint = `https://api.neynar.com/v2/farcaster/cast?identifier=${hash}&type=hash`;
    }
    
    // Fetch cast from Neynar API
    const response = await fetch(
      endpoint,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Neynar API error:', errorText);
      return NextResponse.json(
        { error: `Failed to fetch cast: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching cast:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cast' },
      { status: 500 }
    );
  }
} 