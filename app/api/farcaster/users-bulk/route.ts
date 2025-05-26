import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { addresses } = await request.json();
    
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { error: 'Addresses array is required' },
        { status: 400 }
      );
    }

    // Filter for valid Ethereum addresses
    const validAddresses = addresses.filter(addr => 
      typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
    );

    if (validAddresses.length === 0) {
      return NextResponse.json({ users: {} });
    }

    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      console.error("Missing Neynar API key");
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Normalize addresses
    const normalizedAddresses = validAddresses.map(addr => addr.toLowerCase());
    const results: Record<string, {
      fid: number;
      username: string;
      displayName: string;
      pfpUrl: string;
      isVerified: boolean;
    } | null> = {};

    // Split into chunks of 20 addresses at a time (API limit)
    const chunkSize = 20;
    const addressChunks: string[][] = [];
    
    for (let i = 0; i < normalizedAddresses.length; i += chunkSize) {
      addressChunks.push(normalizedAddresses.slice(i, i + chunkSize));
    }

    // Process each chunk
    await Promise.all(addressChunks.map(async (chunk) => {
      const addressesParam = chunk.join('%2C');
      
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addressesParam}&address_types=verified_address`,
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
      
      // Process results for each address in this chunk
      chunk.forEach(addr => {
        if (data && data[addr] && data[addr].length > 0) {
          const user = data[addr][0];
          results[addr] = {
            fid: user.fid,
            username: user.username,
            displayName: user.display_name,
            pfpUrl: user.pfp_url,
            isVerified: true
          };
        } else {
          results[addr] = null;
        }
      });
    }));

    return NextResponse.json({ users: results });
    
  } catch (error) {
    console.error('Error fetching Farcaster users in bulk:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
} 