/**
 * Server-side Cloudflare Turnstile verification
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Verify a Turnstile captcha token server-side
 * @param token The captcha token from the client
 * @param clientIP Optional client IP for additional verification
 * @returns Promise resolving to verification result
 */
export async function verifyTurnstileToken(
  token: string,
  clientIP?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the secret key from environment
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    
    if (!secretKey) {
      console.error('TURNSTILE_SECRET_KEY not configured');
      return { 
        success: false, 
        error: 'Captcha verification not configured' 
      };
    }

    // Prepare the verification request
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    
    if (clientIP) {
      formData.append('remoteip', clientIP);
    }

    // Make the verification request
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.error('Turnstile verification request failed:', response.status);
      return { 
        success: false, 
        error: 'Failed to verify captcha' 
      };
    }

    const data: TurnstileVerifyResponse = await response.json();

    if (!data.success) {
      console.error('Turnstile verification failed:', data['error-codes']);
      
      // Map error codes to user-friendly messages
      const errorMessage = data['error-codes']?.includes('invalid-input-response') 
        ? 'Invalid captcha token'
        : data['error-codes']?.includes('timeout-or-duplicate')
        ? 'Captcha expired or already used'
        : 'Captcha verification failed';
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error verifying Turnstile token:', error);
    return { 
      success: false, 
      error: 'Captcha verification failed' 
    };
  }
}

/**
 * Validate if a token is in the expected format
 * @param token The token to validate
 * @returns boolean indicating if token format is valid
 */
export function isValidTurnstileTokenFormat(token: string): boolean {
  // Turnstile tokens are typically alphanumeric strings
  // This is a basic check - the real validation happens server-side
  return typeof token === 'string' && 
         token.length > 0 && 
         token.length < 2048 && // Reasonable max length
         /^[a-zA-Z0-9_-]+$/.test(token);
}