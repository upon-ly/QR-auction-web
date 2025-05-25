import { NextRequest } from 'next/server';

/**
 * Extract the real client IP address from Vercel request headers
 */
export function getClientIP(request: NextRequest): string {
  // Vercel provides the real IP in these headers (in order of preference)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for');
  
  // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2...)
  // Take the first one which is the original client
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (vercelForwardedFor) {
    return vercelForwardedFor;
  }
  
  // Fallback - less reliable
  return 'unknown';
} 