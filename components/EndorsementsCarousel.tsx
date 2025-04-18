"use client";

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TweetEmbed } from '@/components/TweetEmbed';
import "react-farcaster-embed/dist/styles.css";
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Testimonial {
  id: number;
  url: string;
  type: 'warpcast' | 'twitter';
  carousel?: boolean;
  is_approved?: boolean;
  is_featured?: boolean;
  priority?: number;
}

// Component to safely render embeds with error handling
const SafeEmbed = ({ testimonial }: { testimonial: Testimonial }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle click on any embed to open the original URL
  const handleEmbedClick = (url: string) => {
    window.open(url, '_blank');
  };

  useEffect(() => {
    // Reset states when testimonial changes
    setHasError(false);
    setIsLoaded(false);
    
    // For Farcaster embeds, set a timeout to consider it an error if it takes too long to load
    if (testimonial.type === 'warpcast') {
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      // Set a timeout for 10 seconds to consider it failed if not loaded by then
      timerRef.current = setTimeout(() => {
        if (!isLoaded) {
          setHasError(true);
        }
      }, 10000);
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [testimonial, isLoaded]);

  // After render, mark as loaded for Farcaster embeds
  useEffect(() => {
    if (testimonial.type === 'warpcast') {
      // Small delay to let the embed actually render
      const timer = setTimeout(() => {
        setIsLoaded(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [testimonial.type]);

  if (hasError) {
    return (
      <div 
        className="flex flex-col items-center justify-center p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer h-full"
        onClick={() => handleEmbedClick(testimonial.url)}
      >
        <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Unable to load content
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 underline">
          Click to view original
        </p>
      </div>
    );
  }

  try {
    if (testimonial.type === 'warpcast') {
      return (
        <div 
          className="cursor-pointer" 
          onClick={() => handleEmbedClick(testimonial.url)}
        >
          <FarcasterEmbed url={testimonial.url} />
        </div>
      );
    } else {
      return (
        <TweetEmbed 
          tweetUrl={testimonial.url} 
          onError={() => setHasError(true)}
          showLoader={false}
          onClick={() => handleEmbedClick(testimonial.url)}
        />
      );
    }
  } catch (error) {
    console.error("Error rendering embed:", error);
    setHasError(true);
    return (
      <div 
        className="flex flex-col items-center justify-center p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer h-full"
        onClick={() => handleEmbedClick(testimonial.url)}
      >
        <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Unable to load content
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 underline">
          Click to view original
        </p>
      </div>
    );
  }
};

export function EndorsementsCarousel() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialRenderRef = useRef(true);
  
  useEffect(() => {
    fetchCarouselTestimonials();
    
    return () => {
      // Cleanup interval on component unmount
      if (autoplayIntervalRef.current) {
        clearInterval(autoplayIntervalRef.current);
      }
    };
  }, []);

  // Add a separate effect to handle auto-rotation after initial render
  useEffect(() => {
    if (testimonials.length > 0 && !loading) {
      // Slight delay for initial render to complete
      const timer = setTimeout(() => {
        initialRenderRef.current = false;
        startAutoRotation();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [testimonials, loading]);

  const fetchCarouselTestimonials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .eq('is_approved', true)
        .eq('carousel', true)
        .order('priority', { ascending: false });
        
      if (error) {
        throw error;
      }
      
      // Filter out testimonials with invalid URLs
      const validTestimonials = data?.filter(testimonial => {
        if (!testimonial.url) return false;
        
        if (testimonial.type === 'warpcast') {
          return testimonial.url.includes('warpcast.com');
        } else if (testimonial.type === 'twitter') {
          return testimonial.url.includes('twitter.com') || testimonial.url.includes('x.com');
        }
        
        return false;
      }) || [];
      
      if (validTestimonials.length > 0) {
        setTestimonials(validTestimonials);
        // Start auto-rotation once we have testimonials
        startAutoRotation();
      } else {
        // Fallback to featured testimonials if no carousel ones are found
        const { data: featuredData, error: featuredError } = await supabase
          .from('testimonials')
          .select('*')
          .eq('is_approved', true)
          .eq('is_featured', true)
          .order('priority', { ascending: false })
          .limit(5);
          
        if (featuredError) {
          throw featuredError;
        }
        
        // Filter out testimonials with invalid URLs
        const validFeaturedTestimonials = featuredData?.filter(testimonial => {
          if (!testimonial.url) return false;
          
          if (testimonial.type === 'warpcast') {
            return testimonial.url.includes('warpcast.com');
          } else if (testimonial.type === 'twitter') {
            return testimonial.url.includes('twitter.com') || testimonial.url.includes('x.com');
          }
          
          return false;
        }) || [];
        
        setTestimonials(validFeaturedTestimonials);
        if (validFeaturedTestimonials.length > 0) {
          startAutoRotation();
        }
      }
    } catch (error) {
      console.error('Error fetching testimonials:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const startAutoRotation = () => {
    if (autoplayIntervalRef.current) {
      clearInterval(autoplayIntervalRef.current);
    }
    
    // Auto-rotate every 5 seconds
    autoplayIntervalRef.current = setInterval(() => {
      if (!isTransitioning) {
        handleChangeSlide('next');
      }
    }, 5000);
  };
  
  const handleChangeSlide = (direction: 'prev' | 'next') => {
    // Don't do anything if we have no testimonials
    if (testimonials.length === 0) return;
    
    // Prevent rapid clicks during transition
    if (isTransitioning) return;
    
    // Start transition
    setIsTransitioning(true);
    
    // Reset autoplay timer only on manual navigation
    if (!initialRenderRef.current) {
      if (autoplayIntervalRef.current) {
        clearInterval(autoplayIntervalRef.current);
      }
    }
    
    setTimeout(() => {
      // Update index after fade out
      if (direction === 'next') {
        setCurrentIndex((prevIndex) => 
          prevIndex === testimonials.length - 1 ? 0 : prevIndex + 1
        );
      } else {
        setCurrentIndex((prevIndex) => 
          prevIndex === 0 ? testimonials.length - 1 : prevIndex - 1
        );
      }
      
      // Reset transition flag after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
        
        // Restart auto-rotation after manual navigation is complete
        if (!initialRenderRef.current) {
          startAutoRotation();
        }
      }, 400); // Slightly longer than CSS transition to ensure completion
    }, 200);
  };
  
  if (loading || testimonials.length === 0) {
    return null;
  }
  
  return (
    <div className="py-8 lg:py-10 md:py-10">
      <div className="container mx-auto md:px-4 lg:px-4">
        <div className="relative">
          <div className="overflow-hidden">
            <div className="flex justify-center">
              <div className="h-[440px] lg:h-[420px] md:h-[420px] w-full max-w-xl relative">
                <div className="lg:p-4 py-4 w-full h-full overflow-y-auto flex items-center justify-center">
                  <div 
                    className={`transition-opacity duration-400 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'} w-full`} 
                  >
                    {testimonials[currentIndex] && (
                      <SafeEmbed testimonial={testimonials[currentIndex]} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative max-w-xl mx-auto">
            {/* Navigation arrows centered */}
            <div className="flex justify-center mt-6 gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handleChangeSlide('prev')}
                className="rounded-full"
                disabled={isTransitioning || testimonials.length <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handleChangeSlide('next')}
                className="rounded-full"
                disabled={isTransitioning || testimonials.length <= 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {/* See more link positioned at right edge */}
            <div className="absolute right-0 bottom-0 mb-2 pr-4">
              <Link 
                href="/love"
                className="text-sm font-medium text-[#472B92] hover:underline"
              >
                See more →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 