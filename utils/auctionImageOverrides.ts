import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Cache for auction image overrides to avoid repeated database calls
 */
let imageOverridesCache: Map<number, { url: string; isVideo: boolean }> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all auction image overrides from database
 */
async function fetchAuctionImageOverrides(): Promise<Map<number, { url: string; isVideo: boolean }>> {
  const now = Date.now();
  
  // Return cached data if it's still fresh
  if (imageOverridesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return imageOverridesCache;
  }

  try {
    const { data, error } = await supabase
      .from('auction_image_overrides')
      .select('auction_id, image_url, is_video')
      .order('auction_id');

    if (error) {
      console.error('Error fetching auction image overrides:', error);
      // Return empty map on error, will fall back to Link Preview API
      return new Map();
    }

    // Build cache map
    const overridesMap = new Map<number, { url: string; isVideo: boolean }>();
    data.forEach(override => {
      overridesMap.set(override.auction_id, {
        url: override.image_url,
        isVideo: override.is_video
      });
    });

    // Update cache
    imageOverridesCache = overridesMap;
    cacheTimestamp = now;

    return overridesMap;
  } catch (error) {
    console.error('Error fetching auction image overrides:', error);
    return new Map();
  }
}

/**
 * Helper function to check if a URL is a video URL
 */
export function isVideoUrl(url: string): boolean {
  // Check for common video domains or extensions
  return url.includes('gwum763zx9') || 
         url.includes('.mp4') || 
         url.includes('.webm') || 
         url.includes('.ogg') ||
         url.includes('giphy.gif');
}

/**
 * Helper function to get an image for a specific auction ID
 * Falls back to default image if no override exists
 */
export async function getAuctionImage(auctionId: number | string, defaultImage?: string): Promise<string | null> {
  const id = typeof auctionId === 'string' ? parseInt(auctionId, 10) : auctionId;
  
  try {
    const overrides = await fetchAuctionImageOverrides();
    const override = overrides.get(id);
    
    // If there's an override and it has a non-empty URL, use it
    if (override && override.url.trim() !== '') {
      return override.url;
    }
    
    // If a default image was provided, use it
    if (defaultImage) {
      return defaultImage;
    }
    
    // Otherwise return null to allow the Link Preview API to be used
    return null;
  } catch (error) {
    console.error('Error getting auction image:', error);
    return defaultImage || null;
  }
}

/**
 * Helper function to check if an auction image is a video
 */
export async function isAuctionImageVideo(auctionId: number | string): Promise<boolean> {
  const id = typeof auctionId === 'string' ? parseInt(auctionId, 10) : auctionId;
  
  try {
    const overrides = await fetchAuctionImageOverrides();
    const override = overrides.get(id);
    
    return (override && override.url.trim() !== '') ? override.isVideo : false;
  } catch (error) {
    console.error('Error checking if auction image is video:', error);
    return false;
  }
}

/**
 * Add a new auction image override to the database
 */
export async function addAuctionImageOverride(
  auctionId: number | string, 
  imageUrl: string, 
  isVideo: boolean = false
): Promise<boolean> {
  const id = typeof auctionId === 'string' ? parseInt(auctionId, 10) : auctionId;
  
  try {
    const { error } = await supabase
      .from('auction_image_overrides')
      .upsert({
        auction_id: id,
        image_url: imageUrl,
        is_video: isVideo
      });

    if (error) {
      console.error('Error adding auction image override:', error);
      return false;
    }

    // Clear cache to force refresh
    imageOverridesCache = null;
    
    return true;
  } catch (error) {
    console.error('Error adding auction image override:', error);
    return false;
  }
}

/**
 * Clear auction image override for a specific auction ID (sets image_url to empty string)
 */
export async function removeAuctionImageOverride(auctionId: number | string): Promise<boolean> {
  const id = typeof auctionId === 'string' ? parseInt(auctionId, 10) : auctionId;
  
  try {
    const { error } = await supabase
      .from('auction_image_overrides')
      .update({ 
        image_url: '',
        is_video: false 
      })
      .eq('auction_id', id);

    if (error) {
      console.error(`Error clearing auction image override for auction #${id}:`, error);
      return false;
    }

    console.log(`Cleared auction image override for auction #${id}`);
    
    // Clear cache to force refresh
    imageOverridesCache = null;
    
    return true;
  } catch (error) {
    console.error(`Error clearing auction image override for auction #${id}:`, error);
    return false;
  }
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getAuctionImage() instead
 */
export const auctionImageOverrides: Record<string, string> = new Proxy({}, {
  get() {
    console.warn('auctionImageOverrides object is deprecated. Use getAuctionImage() function instead.');
    return undefined;
  }
}); 