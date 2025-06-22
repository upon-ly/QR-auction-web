import { track } from '@vercel/analytics';
import { useCallback } from 'react';

interface AnalyticsEventProps {
  [key: string]: any;
}

export const useAnalytics = () => {
  const trackEvent = useCallback((eventName: string, properties?: AnalyticsEventProps) => {
    try {
      track(eventName, properties);
    } catch (error) {
      console.error('Analytics tracking error:', error);
    }
  }, []);

  return { trackEvent };
};

// Pre-defined event names for consistency
export const ANALYTICS_EVENTS = {
  // Button clicks
  BUY_QR_CLICKED: 'buy_qr_clicked',
  CLAIM_QR_CLICKED: 'claim_qr_clicked',
  VISIT_WINNER_CLICKED: 'visit_winner_clicked',
  SHARE_CLICKED: 'share_clicked',
  
  // Auction events
  BID_PLACED: 'bid_placed',
  AUCTION_VIEWED: 'auction_viewed',
  
  // Link visit events
  LINK_VISIT_POPUP_OPENED: 'link_visit_popup_opened',
  LINK_VISIT_CLAIM_SUCCESS: 'link_visit_claim_success',
  LINK_VISIT_CLAIM_FAILED: 'link_visit_claim_failed',
  
  // User actions
  WALLET_CONNECTED: 'wallet_connected',
  LOGIN_COMPLETED: 'login_completed',
} as const;