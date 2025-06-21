"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useBaseColors } from "@/hooks/useBaseColors";
import { ThemeDialog } from "@/components/ThemeDialog";
import { TweetEmbed } from "@/components/TweetEmbed";
import { Skeleton } from "@/components/ui/skeleton";
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { Copy, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import "react-farcaster-embed/dist/styles.css";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { frameSdk } from "@/lib/frame-sdk-singleton";
import Link from "next/link";

interface Testimonial {
  id: number;
  url: string;
  type: 'warpcast' | 'twitter';
  author?: string;
  content?: string;
  is_approved: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  priority: number;
}

export default function WallOfLovePage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFrameRef = useRef(false);
  const PAGE_SIZE = 10;
  
  const isBaseColors = useBaseColors();

  const fetchTestimonials = useCallback(async (pageNumber: number) => {
    try {
      if (pageNumber === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      console.log(`Fetching page ${pageNumber}, from ${pageNumber * PAGE_SIZE} to ${(pageNumber + 1) * PAGE_SIZE - 1}`);
      
      const from = pageNumber * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      const { data, error, count } = await supabase
        .from('testimonials')
        .select('*', { count: 'exact' })
        .eq('is_approved', true)
        .order('carousel', { ascending: false })
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
        
      if (error) {
        throw error;
      }
      
      console.log(`Received ${data?.length || 0} items, total count: ${count}`);
      
      // Check if we received data
      if (!data || data.length === 0) {
        setHasMore(false);
        console.log('No more items to load');
        return;
      }
      
      if (pageNumber === 0) {
        setTestimonials(data);
      } else {
        setTestimonials(prev => [...prev, ...data]);
      }
      
      // Check if there are more testimonials to load
      const currentTotalLoaded = from + data.length;
      const hasMoreItems = count !== null && count !== undefined && currentTotalLoaded < count;
      console.log(`Current total loaded: ${currentTotalLoaded}, Has more: ${hasMoreItems}`);
      setHasMore(hasMoreItems);
      
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  
  // Observer callback for infinite scroll
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    if (entry.isIntersecting && hasMore && !loadingMore) {
      console.log('Loading more posts, current page:', page);
      setPage(prevPage => prevPage + 1);
    }
  }, [hasMore, loadingMore, page]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!loading) { // Only observe when initial loading is complete
      const options = {
        root: null,
        rootMargin: '600px', // Increased for earlier detection
        threshold: 0.1
      };
      
      const observer = new IntersectionObserver(handleObserver, options);
      
      if (loaderRef.current) {
        observer.observe(loaderRef.current);
      }
      
      return () => {
        if (loaderRef.current) {
          observer.unobserve(loaderRef.current);
        }
      };
    }
  }, [handleObserver, loading]);

  // Reset everything on component mount
  useEffect(() => {
    console.log("Component mounted, resetting state");
    setPage(0);
    setTestimonials([]);
    setHasMore(true);
    // fetchTestimonials(0) will be called by the page effect
  }, []);

  // Load more testimonials when page changes
  useEffect(() => {
    console.log('Page changed to:', page);
    fetchTestimonials(page);
  }, [page, fetchTestimonials]);
  
  // Check if we're running in a Farcaster frame context
  useEffect(() => {
    async function checkFrameContext() {
      try {
        const context = await frameSdk.getContext();
        isFrameRef.current = !!context?.user;
        console.log("Frame context check:", isFrameRef.current ? "In frame" : "Not in frame");
      } catch (error) {
        console.error("Error checking frame context:", error);
      }
    }
    checkFrameContext();
  }, []);
  
  // Open Warpcast compose URL
  const handleCastClick = async () => {
    const url = 'https://warpcast.com/~/compose?text=we%20like%20%40qrcoindotfun';
    
    if (isFrameRef.current) {
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening Warpcast in frame:", error);
      }
    } else {
      window.open(url, '_blank', "noopener,noreferrer");
    }
  };

  // Open Twitter compose URL
  const handleTweetClick = async () => {
    const url = 'https://twitter.com/intent/tweet?text=we%20like%20%40qrcoindotfun';
    
    if (isFrameRef.current) {
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening Twitter in frame:", error);
      }
    } else {
      window.open(url, '_blank', "noopener,noreferrer");
    }
  };
  
  // Handle click on a Farcaster embed to open the original URL
  const handleFarcasterEmbedClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = e.currentTarget.getAttribute('data-url');
    if (!url) return;
    
    if (isFrameRef.current) {
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening URL in frame:", error);
      }
    } else {
      window.open(url, '_blank', "noopener,noreferrer");
    }
  };
  
  // Handle tweet embed click
  const handleTweetEmbedClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = e.currentTarget.getAttribute('data-url');
    if (!url) return;
    
    if (isFrameRef.current) {
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening URL in frame:", error);
      }
    } else {
      window.open(url, '_blank', "noopener,noreferrer");
    }
  };
  
  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;
  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("CA copied!");
  };

  // Add custom CSS to fix video embeds and Twitter spacing
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Fix for Twitter embed whitespace */
      .twitter-tweet, 
      .twitter-tweet-rendered, 
      .twitter-embed-fixed,
      .twitter-tweet-rendered iframe {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
      }
      
      /* Fix for Farcaster video player */
      .cast-body video,
      media-controller,
      hls-video,
      .farcaster-embed-video-player {
        max-width: 100%;
        height: auto !important;
        aspect-ratio: 16/9;
        z-index: 10 !important;
        position: relative !important;
      }
      
      /* Ensure video container has proper dimensions */
      .farcaster-embed-video-container {
        position: relative !important;
        z-index: 5 !important;
        width: 100% !important;
        min-height: 200px !important;
      }
      
      /* Fix media-chrome controls */
      media-control-bar {
        z-index: 20 !important;
        position: relative !important;
      }
      
      /* Remove extra padding in Twitter embeds */
      .twitter-tweet, .twitter-tweet-rendered {
        padding: 0 !important;
      }
      
      /* Fix for quoted Farcaster casts on mobile */
      @media (max-width: 640px) {
        .farcaster-embed-quote {
          display: block !important;
          width: 100% !important;
        }
        
        .farcaster-embed-quote-cast-container {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
        }
        
        .farcaster-embed-quote-cast {
          width: 100% !important;
          word-break: break-word !important;
        }
        
        .farcaster-embed-image-container img {
          max-width: 100% !important;
          height: auto !important;
        }
        
        .farcaster-embed-body {
          width: 100% !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
        }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Add a general handler for external links
  const handleExternalLink = async (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (isFrameRef.current) {
      e.preventDefault();
      try {
        await frameSdk.redirectToUrl(url);
      } catch (error) {
        console.error("Error opening URL in frame:", error);
      }
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="z-10 mb-8 w-full flex flex-col items-center justify-center px-4">
        <div className="max-w-6xl w-full flex flex-col space-y-6">  
          <div className="flex flex-col space-y-3 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-center">
              <span className="flex items-center justify-center gap-2">
                Wall of Love
              </span>
            </h1>
            
            {/* Tweet & Cast buttons */}
            <div className="flex justify-center gap-4 mt-2">
              <Button 
                onClick={handleTweetClick}
                className={`w-28 ${
                  isBaseColors
                    ? "bg-primary text-secondary hover:bg-primary/90"
                    : "bg-[#1C9BEF] text-white hover:bg-[#1A8CD8] dark:bg-[#1C9BEF] dark:text-white dark:hover:bg-[#1A8CD8]"
                }`}
              >
                Tweet
              </Button>
              <Button 
                onClick={handleCastClick}
                className="w-28 bg-[#472B92] text-white hover:bg-[#3b2277]"
              >
                Cast
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-8">
          {loading ? (
            // Initial loading skeletons
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="w-full flex justify-center">
                <div className="max-w-xl w-full px-0 md:px-[50px]">
                  {/* Alternating between Warpcast and Twitter-style skeletons */}
                  {i % 2 === 0 ? (
                    // Warpcast-style skeleton
                    <div className={`p-4 border rounded-xl shadow-sm ${
                      isBaseColors 
                        ? "bg-primary/5 border-primary/10" 
                        : "bg-white border-gray-200 dark:bg-gray-950 dark:border-gray-800"
                    }`}>
                      {/* Header with profile pic and name */}
                      <div className="flex items-start space-x-3 mb-4">
                        <Skeleton className={`h-10 w-10 rounded-full flex-shrink-0 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline space-x-2">
                            <Skeleton className={`h-5 w-24 ${isBaseColors ? "bg-primary/20" : ""}`} />
                            <Skeleton className={`h-4 w-16 ml-1 ${isBaseColors ? "bg-primary/20" : ""}`} />
                          </div>
                          <Skeleton className={`h-3 w-32 mt-1 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        {/* Farcaster logo placeholder */}
                        <div className="h-6 w-6 rounded-full bg-[#472B92] opacity-40 flex-shrink-0"></div>
                      </div>
                      
                      {/* Content */}
                      <div className="space-y-2 mb-4 overflow-hidden">
                        <Skeleton className={`h-4 w-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-4 w-11/12 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-4 w-4/5 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      </div>
                      
                      {/* Image placeholder - appears in some casts */}
                      {i === 0 && (
                        <Skeleton className={`h-48 w-full rounded-lg my-4 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      )}
                      
                      {/* Footer with reactions */}
                      <div className={`flex items-center pt-2 space-x-6 mt-4 border-t ${
                        isBaseColors ? "border-primary/10" : "border-gray-100 dark:border-gray-800"
                      }`}>
                        <div className="flex items-center space-x-1">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-6 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex items-center space-x-1">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-6 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex items-center space-x-1">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-6 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Twitter-style skeleton
                    <div className={`p-4 border rounded-xl shadow-sm ${
                      isBaseColors 
                        ? "bg-primary/5 border-primary/10" 
                        : "bg-white border-gray-200 dark:bg-gray-950 dark:border-gray-800"
                    }`}>
                      {/* Header with profile pic and name */}
                      <div className="flex items-start space-x-3 mb-4">
                        <Skeleton className={`h-12 w-12 rounded-full flex-shrink-0 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline space-x-2">
                            <Skeleton className={`h-5 w-32 ${isBaseColors ? "bg-primary/20" : ""}`} />
                            <Skeleton className={`h-4 w-24 ${isBaseColors ? "bg-primary/20" : ""}`} />
                          </div>
                          <Skeleton className={`h-3 w-40 mt-1 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        {/* Twitter logo placeholder */}
                        <div className="h-5 w-5 rounded-full bg-[#1C9BEF] opacity-40 flex-shrink-0"></div>
                      </div>
                      
                      {/* Content */}
                      <div className="space-y-2 mb-4 overflow-hidden">
                        <Skeleton className={`h-5 w-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-5 w-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-5 w-3/4 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      </div>
                      
                      {/* Image/embed - every other Twitter skeleton has image */}
                      {i === 1 && (
                        <Skeleton className={`h-64 w-full rounded-xl my-4 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      )}
                      
                      {/* Footer with engagement metrics */}
                      <div className={`flex items-center justify-between pt-3 w-full mt-4 border-t ${
                        isBaseColors ? "border-primary/10" : "border-gray-100 dark:border-gray-800"
                      }`}>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : testimonials.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500">No testimonials found</p>
            </div>
          ) : (
            // Render testimonials
            <>
              {testimonials.map((testimonial) => (
                <div key={testimonial.id} className="w-full flex justify-center">
                  <div className="max-w-xl w-full px-0 md:px-[50px]">
                    {testimonial.type === 'warpcast' ? (
                      <div
                        className="cursor-pointer" 
                        onClick={handleFarcasterEmbedClick}
                        data-url={testimonial.url}
                      >
                        <FarcasterEmbed url={testimonial.url} />
                      </div>
                    ) : (
                      <div className="relative overflow-hidden">
                        {/* Transparent overlay to capture clicks */}
                        <div 
                          className="absolute inset-0 z-10 cursor-pointer"
                          onClick={handleTweetEmbedClick}
                          data-url={testimonial.url}
                        ></div>
                        <TweetEmbed 
                          tweetUrl={testimonial.url} 
                          showLoader={true}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Minimal loading indicator for infinite scroll */}
              <div 
                ref={loaderRef}
                className="w-full flex justify-center py-4"
              >
                {loadingMore && (
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                )}
                {!hasMore && testimonials.length > 0 && (
                  <p className="text-gray-500 text-sm">You&apos;ve reached the end!</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      <footer className="mt-10 text-center flex flex-col items-center">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a
            href="https://x.com/QRcoindotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="X (formerly Twitter)"
            onClick={(e) => handleExternalLink(e, "https://x.com/QRcoindotfun")}
          >
            <XLogo type="footer"/>
          </a>
          <a
            href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Dexscreener"
            onClick={(e) => handleExternalLink(e, "https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0")}
          >
            <DexscreenerLogo />
          </a>
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Uniswap"
            onClick={(e) => handleExternalLink(e, "https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base")}
          >
            <UniswapLogo />
          </a>
        </div>
        <div
          className="inline-flex items-center text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label
            className={clsx(
              isBaseColors ? "text-foreground" : "",
              "mr-1 cursor-pointer"
            )}
          >
            CA: {contractAddress}
          </label>
          <button
            onClick={copyToClipboard}
            className={clsx(
              isBaseColors
                ? " text-foreground hover:text-primary/90"
                : "hover:bg-gray-100",
              "p-1 rounded-full transition-colors"
            )}
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check
                className={clsx(
                  isBaseColors ? "text-foreground" : "text-green-500",
                  "h-3 w-3"
                )}
              />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 md:mr-5.5 mr-[20px]">
          <Link
            href="/terms-of-use"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Terms of Service
          </Link>
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px]">•</span>
          <Link
            href="/privacy-policy"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Privacy Policy
          </Link>
          <span className="text-gray-600 dark:text-[#696969] text-[12px] md:text-[15px] flex items-center h-8">•</span>
          <Link
            href="/support"
            className={clsx(
              "text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono",
              isBaseColors ? "text-foreground hover:text-primary/90" : ""
            )}
          >
            Support
          </Link>
        </div>
      </footer>
      
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </main>
  );
} 