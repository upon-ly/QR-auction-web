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
        { error: 'Service temporarily unavailable' },
        { status: 503 }
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
        // Handle different API error responses appropriately
        if (response.status === 404) {
          // No users found - set all addresses in chunk to null
          chunk.forEach(addr => {
            results[addr] = null;
          });
          return;
        } else if (response.status === 401 || response.status === 403 ||
                   response.status === 429 || response.status >= 500) {
          // API authentication, rate limit, or server errors - throw to be caught by outer catch
          throw new Error(`Neynar API unavailable: ${response.status}`);
        } else {
          // Other client errors - set all addresses in chunk to null
          chunk.forEach(addr => {
            results[addr] = null;
          });
          return;
        }
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
    console.error('Error in users-bulk:', error);
    // API errors or network issues - return 503 for temporary unavailability
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
} 