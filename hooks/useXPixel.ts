import { useCallback } from 'react';

// X Pixel event types (only what we use)
export type XPixelEventType = 
  | 'ViewContent'
  | 'Lead';

export interface XPixelEventParams {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  // Custom parameters for QRCoin
  auction_id?: number;
  token_type?: string;
}

declare global {
  interface Window {
    twq: (command: string, eventType?: string, params?: Record<string, unknown>) => void;
  }
}

export const useXPixel = () => {
  const trackEvent = useCallback((eventType: XPixelEventType, params?: XPixelEventParams) => {
    if (typeof window === 'undefined' || !window.twq) {
      console.warn('X Pixel not loaded');
      return;
    }

    try {
      // Clean params - remove undefined values
      const cleanParams = params ? Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
      ) : {};

      window.twq('event', eventType, cleanParams);
      
      console.log(`[X Pixel] Tracked ${eventType}:`, cleanParams);
    } catch (error) {
      console.error('Error tracking X Pixel event:', error);
    }
  }, []);

  return {
    trackEvent
  };
}; 