// Type definitions and utilities for Farcaster integration

type FarcasterUser = {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  isVerified: boolean;
};

// Cache Farcaster usernames to reduce API calls
const farcasterCache = new Map<string, FarcasterUser | null>();

/**
 * Fetches Farcaster username for an Ethereum address
 * @param address The Ethereum address to look up
 * @returns Farcaster user info or null if not found
 */
export async function getFarcasterUser(address: string): Promise<FarcasterUser | null> {
  // Make sure we're using a valid Ethereum address (0x...) and not a name
  if (!address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid Ethereum address format for Farcaster lookup:', address);
    return null;
  }
  
  // Normalize address
  const normalizedAddress = address.toLowerCase();
  
  // Check cache first
  if (farcasterCache.has(normalizedAddress)) {
    return farcasterCache.get(normalizedAddress) || null;
  }
  
  try {
    // Format address for API
    const formattedAddress = normalizedAddress;
    
    // Fetch from Neynar API
    const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!apiKey) {
      console.error("Missing Neynar API key");
      return null;
    }
    
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${formattedAddress}&address_types=verified_address`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-api-key': apiKey
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Neynar API response:", data);
    
    // Process API response - the response structure is different than expected
    // It returns an object with address as key and array of users as value
    if (data && data[normalizedAddress] && data[normalizedAddress].length > 0) {
      const user = data[normalizedAddress][0];
      const farcasterUser: FarcasterUser = {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        isVerified: true
      };
      
      // Cache the result
      farcasterCache.set(normalizedAddress, farcasterUser);
      
      return farcasterUser;
    }
    
    // If no user found, cache null to avoid repeated lookups
    farcasterCache.set(normalizedAddress, null);
    return null;
  } catch (error) {
    console.error('Error fetching Farcaster username:', error);
    return null;
  }
}

/**
 * Fetches Farcaster usernames for multiple Ethereum addresses in bulk
 * @param addresses Array of Ethereum addresses to look up
 * @returns Map of address to Farcaster user info
 */
export async function getFarcasterUsersBulk(addresses: string[]): Promise<Map<string, FarcasterUser | null>> {
  const results = new Map<string, FarcasterUser | null>();
  
  // Filter for valid Ethereum addresses
  const validAddresses = addresses.filter(addr => addr.startsWith('0x') && addr.length === 42);
  
  if (validAddresses.length === 0) {
    return results;
  }
  
  // Normalize addresses
  const normalizedAddresses = validAddresses.map(addr => addr.toLowerCase());
  
  // Check which addresses are already cached
  const uncachedAddresses = normalizedAddresses.filter(addr => !farcasterCache.has(addr));
  
  // Add cached results to the results map
  normalizedAddresses.forEach(addr => {
    if (farcasterCache.has(addr)) {
      results.set(addr, farcasterCache.get(addr) || null);
    }
  });
  
  // If all addresses are cached, return early
  if (uncachedAddresses.length === 0) {
    return results;
  }
  
  try {
    // Split into chunks of 20 addresses at a time (API limit)
    const chunkSize = 20;
    const addressChunks: string[][] = [];
    
    for (let i = 0; i < uncachedAddresses.length; i += chunkSize) {
      addressChunks.push(uncachedAddresses.slice(i, i + chunkSize));
    }
    
    // Process each chunk with the API
    await Promise.all(addressChunks.map(async (chunk) => {
      const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
      if (!apiKey) {
        console.error("Missing Neynar API key");
        return;
      }
      
      // Format addresses for API (comma-separated)
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
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Process results for each address in this chunk
      chunk.forEach(addr => {
        if (data && data[addr] && data[addr].length > 0) {
          const user = data[addr][0];
          const farcasterUser: FarcasterUser = {
            fid: user.fid,
            username: user.username,
            displayName: user.display_name,
            pfpUrl: user.pfp_url,
            isVerified: true
          };
          
          // Update cache and results
          farcasterCache.set(addr, farcasterUser);
          results.set(addr, farcasterUser);
        } else {
          // Cache null for addresses with no users
          farcasterCache.set(addr, null);
          results.set(addr, null);
        }
      });
    }));
    
    return results;
  } catch (error) {
    console.error('Error fetching Farcaster usernames in bulk:', error);
    return results;
  }
}