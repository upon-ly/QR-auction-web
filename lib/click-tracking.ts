// Utility function to track redirect clicks
export async function trackRedirectClick(auctionId: number, clickSource: string) {
  try {
    const response = await fetch('/api/track-redirect-click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auctionId,
        clickSource
      })
    });

    if (!response.ok) {
      console.warn('Failed to track redirect click:', response.status);
    }
  } catch (error) {
    console.warn('Error tracking redirect click:', error);
  }
}

// Click source constants
export const CLICK_SOURCES = {
  QR_ARROW: 'qr_arrow',
  WINNER_LINK: 'winner_link', 
  WINNER_IMAGE: 'winner_image',
  POPUP_BUTTON: 'popup',
  POPUP_IMAGE: 'popup'
} as const;

export type ClickSource = typeof CLICK_SOURCES[keyof typeof CLICK_SOURCES]; 