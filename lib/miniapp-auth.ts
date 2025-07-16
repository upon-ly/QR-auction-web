import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Server secret for HMAC
const MINIAPP_SECRET = process.env.MINIAPP_AUTH_SECRET;

// Ensure secret is set
if (!MINIAPP_SECRET) {
  throw new Error('MINIAPP_AUTH_SECRET environment variable is required');
}

interface MiniAppAuthToken {
  fid: number;
  address: string;
  username?: string;
  timestamp: number;
  nonce: string;
  clientFid?: number; // Optional: for CBW detection
}

/**
 * Generate a secure token for mini-app authentication
 * This should be called when mini-app user first loads the claim UI
 */
export async function generateMiniAppToken(
  fid: number, 
  address: string, 
  username?: string,
  clientFid?: number
): Promise<string> {
  const token: MiniAppAuthToken = {
    fid,
    address,
    username,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    clientFid
  };
  
  // Create HMAC signature
  const hmac = crypto.createHmac('sha256', MINIAPP_SECRET as string);
  hmac.update(JSON.stringify(token));
  const signature = hmac.digest('hex');
  
  // Combine token and signature
  const authToken = Buffer.from(JSON.stringify({
    ...token,
    signature
  })).toString('base64');
  
  // Store in Redis with 5 minute expiry
  await redis.set(`miniapp-token:${token.nonce}`, JSON.stringify({
    fid,
    address,
    timestamp: token.timestamp
  }), { ex: 300 });
  
  console.log(`🔐 Generated mini-app token for FID ${fid}, nonce: ${token.nonce}`);
  
  return authToken;
}

/**
 * Verify a mini-app auth token
 */
export async function verifyMiniAppToken(authToken: string): Promise<{ 
  isValid: boolean; 
  fid?: number; 
  address?: string;
  username?: string;
  clientFid?: number;
  error?: string;
}> {
  try {
    // Decode token
    let decoded;
    try {
      const decodedString = Buffer.from(authToken, 'base64').toString();
      decoded = JSON.parse(decodedString);
    } catch {
      console.error('Failed to decode token:', authToken.substring(0, 20) + '...');
      return { isValid: false, error: 'Invalid token format' };
    }
    
    const { fid, address, username, timestamp, nonce, signature, clientFid } = decoded;
    
    // Check timestamp (5 minute expiry)
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      console.log(`⏰ Token expired for FID ${fid}, age: ${Math.floor((Date.now() - timestamp) / 1000)}s`);
      return { isValid: false, error: 'Token expired' };
    }
    
    // Check if nonce exists (not used yet)
    const storedData = await redis.get(`miniapp-token:${nonce}`);
    if (!storedData) {
      console.log(`❌ Token nonce not found or already used: ${nonce}`);
      return { isValid: false, error: 'Invalid or already used token' };
    }
    
    // Verify signature
    const token: MiniAppAuthToken = { fid, address, username, timestamp, nonce, clientFid };
    const hmac = crypto.createHmac('sha256', MINIAPP_SECRET as string);
    hmac.update(JSON.stringify(token));
    const expectedSignature = hmac.digest('hex');
    
    if (signature !== expectedSignature) {
      console.log(`🚫 Invalid signature for FID ${fid}`);
      return { isValid: false, error: 'Invalid token signature' };
    }
    
    // Verify stored data matches
    // Handle case where Redis returns an object or string
    let stored;
    try {
      stored = typeof storedData === 'string' ? JSON.parse(storedData) : storedData;
    } catch {
      console.error('Failed to parse stored token data:', storedData);
      return { isValid: false, error: 'Invalid stored token data' };
    }
    if (stored.fid !== fid || stored.address.toLowerCase() !== address.toLowerCase()) {
      console.log(`🚫 Token data mismatch for FID ${fid}`);
      return { isValid: false, error: 'Token data mismatch' };
    }
    
    // Mark nonce as used by deleting it
    await redis.del(`miniapp-token:${nonce}`);
    console.log(`✅ Token verified and consumed for FID ${fid}, nonce: ${nonce}`);
    
    return { isValid: true, fid, address, username, clientFid };
  } catch (error) {
    console.error('Error verifying mini-app token:', error);
    return { isValid: false, error: 'Failed to verify token' };
  }
}

/**
 * Generate a token for the frontend to use
 * This is called by the mini-app when preparing to claim
 */
interface FrameContext {
  user?: {
    fid: number;
    connectedAddress?: string;
    username?: string;
  };
  client?: {
    clientFid?: number;
  };
}

export async function requestMiniAppToken(
  frameContext: FrameContext
): Promise<{ token?: string; error?: string }> {
  try {
    if (!frameContext?.user?.fid) {
      return { error: 'Invalid frame context' };
    }
    
    const token = await generateMiniAppToken(
      frameContext.user.fid,
      frameContext.user.connectedAddress || '',
      frameContext.user.username,
      frameContext.client?.clientFid
    );
    
    return { token };
  } catch (error) {
    console.error('Error generating mini-app token:', error);
    return { error: 'Failed to generate token' };
  }
}