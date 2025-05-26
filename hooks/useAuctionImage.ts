import { useQuery } from '@tanstack/react-query';
import { getAuctionImage, isAuctionImageVideo } from '@/utils/auctionImageOverrides';

/**
 * Custom hook to fetch auction image override from database, with OG API fallback
 */
export function useAuctionImage(auctionId: number | string, ogUrl?: string, defaultImage?: string) {
  const tokenIdStr = typeof auctionId === 'number' ? auctionId.toString() : auctionId;
  
  return useQuery({
    queryKey: ['auction-image', tokenIdStr, ogUrl],
    queryFn: async () => {
      // First try to get auction image override
      const overrideImageUrl = await getAuctionImage(auctionId);
      
      // If we have a valid override, use it
      if (overrideImageUrl && overrideImageUrl.trim() !== '') {
        const isVideo = await isAuctionImageVideo(auctionId);
        return {
          imageUrl: overrideImageUrl,
          isVideo
        };
      }
      
      // No override or empty override - try to fetch OG image if we have a URL
      if (ogUrl && ogUrl.trim() !== '') {
        try {
          const ogRes = await fetch(`/api/og?url=${encodeURIComponent(ogUrl)}`);
          const data = await ogRes.json();
          
          if (!data.error && data.image) {
            return {
              imageUrl: data.image,
              isVideo: false // OG images are not videos
            };
          }
        } catch (error) {
          console.error(`[useAuctionImage] OG API failed for auction #${auctionId}, URL: ${ogUrl}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            auctionId,
            ogUrl
          });
          // Fall back to default image
        }
      }
      
      // Fallback to default image
      const fallbackImage = defaultImage || `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`;
      return {
        imageUrl: fallbackImage,
        isVideo: false
      };
    },
    // Cache for 10 minutes since these don't change often
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
} 