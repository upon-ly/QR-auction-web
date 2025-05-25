// Simple in-memory rate limiter
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function isRateLimited(identifier: string, maxRequests = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const current = requestCounts.get(identifier);
  
  if (!current || now > current.resetTime) {
    // New window
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return false;
  }
  
  if (current.count >= maxRequests) {
    return true; // Rate limited
  }
  
  // Increment count
  current.count++;
  return false;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 300000); // Clean up every 5 minutes 