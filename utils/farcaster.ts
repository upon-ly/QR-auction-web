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
// Add a separate cache for username lookups
const usernameCache = new Map<string, string | null>();

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
    // Call our secure API route instead of Neynar directly
    const response = await fetch(`/api/farcaster/user-by-address?address=${encodeURIComponent(normalizedAddress)}`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('API error:', data.error);
      return null;
    }
    
    // Cache and return the result
    farcasterCache.set(normalizedAddress, data.user);
    return data.user;
    
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
    // Call our secure API route instead of Neynar directly
    const response = await fetch('/api/farcaster/users-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addresses: uncachedAddresses }),
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('API error:', data.error);
      return results;
    }
    
    // Process results and update cache
    Object.entries(data.users).forEach(([addr, user]) => {
      farcasterCache.set(addr, user as FarcasterUser | null);
      results.set(addr, user as FarcasterUser | null);
    });
    
    return results;
  } catch (error) {
    console.error('Error fetching Farcaster usernames in bulk:', error);
    return results;
  }
}

/**
 * Fetches Farcaster user profile picture by username
 * @param username The Farcaster username to look up
 * @returns Profile picture URL or null if not found
 */
export async function getFarcasterProfilePicture(username: string): Promise<string | null> {
  // Skip invalid usernames
  if (!username || username === "null" || username === "undefined") {
    return null;
  }
  
  // Check cache first
  if (usernameCache.has(username)) {
    return usernameCache.get(username) || null;
  }
  
  try {
    // Call our secure API route instead of Neynar directly
    const response = await fetch(`/api/farcaster/user-by-username?username=${encodeURIComponent(username)}`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('API error:', data.error);
      return null;
    }
    
    // Cache and return the result
    usernameCache.set(username, data.pfpUrl);
    return data.pfpUrl;
    
  } catch (error) {
    console.error(`Error fetching Farcaster pfp for username ${username}:`, error);
    return null;
  }
}

// Export the type for use in supabase data
export type { FarcasterUser };