import { PrivyClient } from '@privy-io/server-auth';

// Initialize Privy client for server-side authentication
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  process.env.PRIVY_APP_SECRET || ''
);

// Admin addresses (hardcoded for now)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

export async function verifyAdminAuth(authHeader: string | null): Promise<{
  isValid: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    console.log('verifyAdminAuth - Received header:', authHeader ? 'Present' : 'Missing');
    console.log('verifyAdminAuth - Privy App ID:', process.env.NEXT_PUBLIC_PRIVY_APP_ID ? 'Set' : 'Missing');
    console.log('verifyAdminAuth - Privy App Secret:', process.env.PRIVY_APP_SECRET ? 'Set' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('verifyAdminAuth - Invalid header format');
      return {
        isValid: false,
        error: 'Missing or invalid authorization header'
      };
    }
    
    const authToken = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('verifyAdminAuth - Token length:', authToken.length);
    
    // Verify the Privy auth token
    const verifiedClaims = await privyClient.verifyAuthToken(authToken);
    console.log('verifyAdminAuth - Verified claims:', verifiedClaims);
    
    if (!verifiedClaims.userId) {
      return {
        isValid: false,
        error: 'No user ID in token claims'
      };
    }
    
    // For upload functionality, just verify the token is valid
    // Admin authorization should be handled on the frontend
    return {
      isValid: true,
      userId: verifiedClaims.userId
    };
    
  } catch (error) {
    console.error('Auth verification error:', error);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown auth error'
    };
  }
}

// Helper to check if a wallet address is an admin
export function isAdmin(address: string): boolean {
  return ADMIN_ADDRESSES.includes(address);
}

/**
 * Extract admin address from verified authentication
 * @param req - Next.js request object
 * @returns Admin address if authenticated, null otherwise
 */
export async function getAuthenticatedAdminAddress(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    const { signature, message, timestamp } = body;
    
    if (!signature || !message || !timestamp) {
      return null;
    }

    const authResult = await verifyAdminAuth(signature);
    
    if (!authResult.isValid || !authResult.userId) {
      return null;
    }

    return authResult.userId;
  } catch (error) {
    console.error('Error extracting admin address:', error);
    return null;
  }
} 