interface MiniAppUser {
  fid: number;
  username?: string;
  verified_addresses?: {
    eth_addresses: string[];
  };
}

interface ValidationResult {
  isValid: boolean;
  user?: MiniAppUser;
  error?: string;
}

export async function validateMiniAppUser(fid: number, username?: string, address?: string, isCoinbaseWallet: boolean = false): Promise<ValidationResult> {
  try {
    // Use Neynar API to verify user exists and get their verified addresses
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'api_key': process.env.NEYNAR_API_KEY || '',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        isValid: false,
        error: `Neynar API error: ${response.status}`
      };
    }

    const data = await response.json();
    
    if (!data.users || data.users.length === 0) {
      return {
        isValid: false,
        error: 'User not found'
      };
    }

    const user = data.users[0];
    
    // Optional: Verify username matches if provided
    if (username && user.username !== username) {
      return {
        isValid: false,
        error: 'Username mismatch'
      };
    }

    // Optional: Verify wallet address is verified for this FID if provided
    if (address) {
      // BYPASS: Skip address verification for Coinbase Wallet clients
      // Coinbase Wallet addresses are not automatically verified in Neynar
      if (isCoinbaseWallet) {
        // Bypass address verification for Coinbase Wallet (ephemeral addresses)
      } else {
        const verifiedAddresses = user.verified_addresses?.eth_addresses || [];
        const normalizedAddress = address.toLowerCase();
        const isAddressVerified = verifiedAddresses.some((addr: string) => addr.toLowerCase() === normalizedAddress);
        
        console.log(`FID ${fid} address verification: address=${address}, verified=${isAddressVerified}, verifiedAddresses=${verifiedAddresses.length}`);
        
        if (!isAddressVerified) {
          return {
            isValid: false,
            error: 'Wallet address is not verified for this Farcaster account'
          };
        }
      }
    }

    return {
      isValid: true,
      user: {
        fid: user.fid,
        username: user.username,
        verified_addresses: user.verified_addresses
      }
    };
  } catch (error) {
    console.error('Mini App validation error:', error);
    return {
      isValid: false,
      error: 'Validation service error'
    };
  }
}

export async function validateMiniAppContext(fid: number): Promise<boolean> {
  try {
    // Check if user has interacted with your Mini App recently
    // This could involve checking your webhook logs or user activity
    
    // For now, just validate the user exists
    const validation = await validateMiniAppUser(fid);
    return validation.isValid;
  } catch (error) {
    console.error('Mini App context validation error:', error);
    return false;
  }
}

// Standalone function to verify if an address is verified for a specific FID
export async function verifyFidOwnsAddress(fid: number, address: string, isCoinbaseWallet: boolean = false): Promise<{ isValid: boolean; error?: string }> {
  try {
    const validation = await validateMiniAppUser(fid, undefined, address, isCoinbaseWallet);
    return {
      isValid: validation.isValid,
      error: validation.error
    };
  } catch (error) {
    console.error('Error verifying FID address:', error);
    return { isValid: false, error: 'Failed to verify address' };
  }
} 