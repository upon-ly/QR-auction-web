"use client";

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { Trash2, Loader2, Star, StarOff, ArrowUpCircle, ArrowDownCircle, AlignJustify } from 'lucide-react';
import { toast } from 'sonner';
import { TwitterEmbed } from '@/components/TwitterEmbed';
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import "react-farcaster-embed/dist/styles.css";

interface Testimonial {
  id: number;
  url: string;
  type: 'warpcast' | 'twitter';
  author?: string;
  content?: string;
  is_approved: boolean;
  is_featured: boolean;
  carousel?: boolean;
  created_at: string;
  updated_at: string;
  priority: number;
}

interface LoadingStates {
  [key: string]: boolean;
}

export function TestimonialsAdmin() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<'warpcast' | 'twitter'>('warpcast');
  const [addingNew, setAddingNew] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Track loading state per testimonial and action
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({});
  
  useEffect(() => {
    fetchTestimonials();
  }, [refreshKey]);
  
  const fetchTestimonials = async () => {
    try {
      setPageLoading(true);
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
        
      if (error) {
        throw error;
      }
      
      // Mark all testimonials as approved for display
      const approvedData = data?.map(item => ({
        ...item,
        is_approved: true
      })) || [];
      
      setTestimonials(approvedData);
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      toast.error('Failed to load testimonials');
    } finally {
      setPageLoading(false);
    }
  };
  
  const detectUrlType = (url: string): 'warpcast' | 'twitter' => {
    if (url.includes('warpcast.com')) {
      return 'warpcast';
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      return 'twitter';
    }
    // Default to warpcast if can't determine
    return 'warpcast';
  };
  
  const addTestimonial = async () => {
    if (!newUrl) {
      toast.error('URL is required');
      return;
    }
    
    try {
      setAddingNew(true);
      
      // Auto-detect type if not explicitly set
      const urlType = detectUrlType(newUrl);
      
      const { error } = await supabase
        .from('testimonials')
        .insert([{
          url: newUrl,
          type: newType || urlType,
          is_approved: true, // Auto-approve testimonials
          is_featured: false,
          priority: 0
        }]);
        
      if (error) {
        throw error;
      }
      
      toast.success('Testimonial added successfully');
      setNewUrl('');
      setNewType('warpcast');
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error adding testimonial:', error);
      toast.error('Failed to add testimonial');
    } finally {
      setAddingNew(false);
    }
  };
  
  const updateTestimonial = async (id: number, updates: Partial<Testimonial>, actionType: string) => {
    const loadingKey = `${id}-${actionType}`;
    
    try {
      // Set loading state for this specific operation
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      const { error } = await supabase
        .from('testimonials')
        .update(updates)
        .eq('id', id);
        
      if (error) {
        throw error;
      }
      
      toast.success('Testimonial updated');
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error updating testimonial:', error);
      toast.error('Failed to update testimonial');
    } finally {
      // Clear loading state for this specific operation
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };
  
  const deleteTestimonial = async (id: number) => {
    const loadingKey = `${id}-delete`;
    
    try {
      // Set loading state for this specific delete operation
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      const { error } = await supabase
        .from('testimonials')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw error;
      }
      
      toast.success('Testimonial deleted');
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error('Error deleting testimonial:', error);
      toast.error('Failed to delete testimonial');
    } finally {
      // Clear loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };
  
  const toggleFeatured = async (id: number, currentValue: boolean) => {
    await updateTestimonial(id, { is_featured: !currentValue }, 'feature');
  };
  
  const toggleCarousel = async (id: number, currentValue: boolean) => {
    await updateTestimonial(id, { carousel: !currentValue }, 'carousel');
  };
  
  const changePriority = async (id: number, currentPriority: number, increment: number) => {
    await updateTestimonial(id, { priority: currentPriority + increment }, increment > 0 ? 'upPriority' : 'downPriority');
  };
  
  // Helper to check loading state for a specific action
  const isLoading = (id: number, actionType: string) => {
    return !!loadingStates[`${id}-${actionType}`];
  };
  
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Add New Testimonial</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input 
              placeholder="Enter URL (Twitter or Warpcast)" 
              value={newUrl} 
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-grow"
            />
            <div className="flex items-center gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="warpcast" 
                  checked={newType === 'warpcast'}
                  onCheckedChange={() => setNewType('warpcast')}
                />
                <label htmlFor="warpcast" className="text-sm font-medium leading-none cursor-pointer">
                  Warpcast
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="twitter" 
                  checked={newType === 'twitter'} 
                  onCheckedChange={() => setNewType('twitter')}
                />
                <label htmlFor="twitter" className="text-sm font-medium leading-none cursor-pointer">
                  Twitter
                </label>
              </div>
            </div>
            <Button onClick={addTestimonial} disabled={addingNew}>
              {addingNew ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Testimonial'
              )}
            </Button>
          </div>
        </div>
      </Card>
      
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Manage Testimonials</h2>
          <span className="text-xs text-gray-500 italic">Note: IDs increment sequentially even after deletions</span>
        </div>
        
        {pageLoading ? (
          <div className="flex justify-center my-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : testimonials.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No testimonials found</p>
          </div>
        ) : (
          testimonials.map((testimonial) => (
            <Card key={testimonial.id} className="p-4 w-full">
              <div className="mb-3 flex flex-wrap gap-2 justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">ID: {testimonial.id}</span>
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                    {testimonial.type === 'warpcast' ? 'Warpcast' : 'Twitter'}
                  </span>
                  <span className="text-sm text-gray-500">
                    Priority: {testimonial.priority}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => changePriority(testimonial.id, testimonial.priority, 1)}
                    disabled={isLoading(testimonial.id, 'upPriority') || isLoading(testimonial.id, 'downPriority')}
                  >
                    {isLoading(testimonial.id, 'upPriority') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => changePriority(testimonial.id, testimonial.priority, -1)}
                    disabled={isLoading(testimonial.id, 'downPriority') || isLoading(testimonial.id, 'upPriority')}
                  >
                    {isLoading(testimonial.id, 'downPriority') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button 
                    variant={testimonial.is_featured ? "secondary" : "outline"} 
                    size="sm" 
                    onClick={() => toggleFeatured(testimonial.id, testimonial.is_featured)}
                    disabled={isLoading(testimonial.id, 'feature')}
                  >
                    {isLoading(testimonial.id, 'feature') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : testimonial.is_featured ? (
                      <Star className="h-4 w-4" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button 
                    variant={testimonial.carousel ? "secondary" : "outline"} 
                    size="sm" 
                    onClick={() => toggleCarousel(testimonial.id, testimonial.carousel || false)}
                    disabled={isLoading(testimonial.id, 'carousel')}
                    title={testimonial.carousel ? "Remove from carousel" : "Add to carousel"}
                  >
                    {isLoading(testimonial.id, 'carousel') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlignJustify className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => deleteTestimonial(testimonial.id)}
                    disabled={isLoading(testimonial.id, 'delete')}
                  >
                    {isLoading(testimonial.id, 'delete') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="py-2">
                <p className="text-sm text-gray-500 mb-2 break-all">URL: {testimonial.url}</p>
                <div className="max-w-xl mx-auto">
                  {testimonial.type === 'warpcast' ? (
                    <FarcasterEmbed url={testimonial.url} />
                  ) : (
                    <TwitterEmbed tweetUrl={testimonial.url} />
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
} 