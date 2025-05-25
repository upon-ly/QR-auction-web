import { useQuery } from '@tanstack/react-query';
import { getAuctionImage, isAuctionImageVideo } from '@/utils/auctionImageOverrides';

/**
 * Custom hook to fetch auction image override from database
 */
export function useAuctionImage(auctionId: number | string, defaultImage?: string) {
  const tokenIdStr = typeof auctionId === 'number' ? auctionId.toString() : auctionId;
  
  return useQuery({
    queryKey: ['auction-image', tokenIdStr],
    queryFn: async () => {
      const imageUrl = await getAuctionImage(auctionId, defaultImage);
      const isVideo = imageUrl ? await isAuctionImageVideo(auctionId) : false;
      
      return {
        imageUrl,
        isVideo
      };
    },
    // Cache for 10 minutes since these don't change often
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
} 