import { NextRequest } from 'next/server';

// Extend NextRequest to include potential IP properties
interface ExtendedNextRequest extends NextRequest {
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

/**
 * Extract the real client IP address from request headers
 * @param request - The Next.js request object
 * @param debug - Whether to log debug information (default: false)
 */
export function getClientIP(request: NextRequest, debug: boolean = false): string {
  const extendedRequest = request as ExtendedNextRequest;
  
  // Check various headers in order of preference
  const headers = [
    'x-forwarded-for',
    'x-real-ip', 
    'x-vercel-forwarded-for',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded',
    'x-cluster-client-ip',
    'x-client-ip',
    'true-client-ip'
  ];
  
  if (debug) {
    // Debug: Log all available headers
    console.log('🔍 IP Detection - Available headers:', {
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-real-ip': request.headers.get('x-real-ip'),
      'x-vercel-forwarded-for': request.headers.get('x-vercel-forwarded-for'),
      'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
      'x-client-ip': request.headers.get('x-client-ip'),
      'true-client-ip': request.headers.get('true-client-ip'),
      // Also check the request's connection info
      ip: extendedRequest.ip,
      socket: extendedRequest.socket?.remoteAddress,
    });
  }
  
  // Try each header in order
  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2...)
      // Take the first one which is the original client
      if (header === 'x-forwarded-for' || header === 'forwarded-for') {
        const firstIP = value.split(',')[0].trim();
        if (firstIP && firstIP !== 'unknown') {
          if (debug) console.log(`✅ IP found in ${header}: ${firstIP}`);
          return firstIP;
        }
      } else {
        if (value !== 'unknown') {
          if (debug) console.log(`✅ IP found in ${header}: ${value}`);
          return value;
        }
      }
    }
  }
  
  // Try to get IP from Next.js request object if available
  const requestIP = extendedRequest.ip;
  if (requestIP && requestIP !== 'unknown') {
    if (debug) console.log(`✅ IP found in request.ip: ${requestIP}`);
    return requestIP;
  }
  
  // Try to get from socket if available (development)
  const socketIP = extendedRequest.socket?.remoteAddress;
  if (socketIP && socketIP !== 'unknown' && socketIP !== '::1' && socketIP !== '127.0.0.1') {
    if (debug) console.log(`✅ IP found in socket.remoteAddress: ${socketIP}`);
    return socketIP;
  }
  
  if (debug) console.log('⚠️ No valid IP found, falling back to unknown');
  return 'unknown';
} 