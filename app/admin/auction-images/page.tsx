"use client";

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { addAuctionImageOverride, removeAuctionImageOverride } from '@/utils/auctionImageOverrides';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AuctionImageOverride {
  id: number;
  auction_id: number;
  image_url: string;
  is_video: boolean;
  created_at: string;
  updated_at: string;
}

export default function AuctionImagesAdmin() {
  const [overrides, setOverrides] = useState<AuctionImageOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAuctionId, setNewAuctionId] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newIsVideo, setNewIsVideo] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Fetch auction image overrides
  const fetchOverrides = async () => {
    try {
      const { data, error } = await supabase
        .from('auction_image_overrides')
        .select('*')
        .order('auction_id', { ascending: false });

      if (error) throw error;
      setOverrides(data || []);
    } catch (error) {
      console.error('Error fetching auction image overrides:', error);
      toast.error('Failed to fetch auction image overrides');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverrides();
  }, []);

  const handleAdd = async () => {
    if (!newAuctionId || !newImageUrl) {
      toast.error('Please fill in all required fields');
      return;
    }

    setAdding(true);
    try {
      const success = await addAuctionImageOverride(newAuctionId, newImageUrl, newIsVideo);
      
      if (success) {
        toast.success('Auction image override added successfully');
        setNewAuctionId('');
        setNewImageUrl('');
        setNewIsVideo(false);
        fetchOverrides(); // Refresh the list
      } else {
        toast.error('Failed to add auction image override');
      }
    } catch (error) {
      console.error('Error adding auction image override:', error);
      toast.error('Failed to add auction image override');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveLatest = async () => {
    if (overrides.length === 0) return;
    
    const latestOverride = overrides[0]; // First item since we order by auction_id desc
    setRemoving(true);
    try {
      const success = await removeAuctionImageOverride(latestOverride.auction_id);
      
      if (success) {
        toast.success(`Auction image override for auction #${latestOverride.auction_id} cleared successfully`);
        fetchOverrides(); // Refresh the list
      } else {
        toast.error('Failed to clear auction image override');
      }
    } catch (error) {
      console.error('Error clearing auction image override:', error);
      toast.error('Failed to clear auction image override');
    } finally {
      setRemoving(false);
    }
  };

  const handleClear = async (auctionId: number) => {
    try {
      const success = await removeAuctionImageOverride(auctionId);
      
      if (success) {
        toast.success(`Cleared auction image override for auction #${auctionId}`);
        fetchOverrides(); // Refresh the list
      } else {
        toast.error('Failed to clear auction image override');
      }
    } catch (error) {
      console.error('Error clearing auction image override:', error);
      toast.error('Failed to clear auction image override');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Auction Image Overrides</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage custom images for auction winners
        </p>
      </div>

      {/* Add new override */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Add New Override</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            placeholder="Auction ID"
            value={newAuctionId}
            onChange={(e) => setNewAuctionId(e.target.value)}
          />
          <Input
            placeholder="Image URL"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            className="md:col-span-2"
          />
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-video"
              checked={newIsVideo}
              onCheckedChange={(checked) => setNewIsVideo(checked as boolean)}
            />
            <label htmlFor="is-video" className="text-sm">Is Video</label>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Override
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleRemoveLatest} 
            disabled={removing || overrides.length === 0}
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Clear Latest
          </Button>
        </div>
      </Card>

      {/* List of overrides */}
      <div className="grid gap-4">
        {overrides.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-gray-500">No auction image overrides found</p>
          </Card>
        ) : (
          overrides.map((override) => (
            <Card key={override.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex items-center justify-center">
                    {override.image_url.trim() === '' ? (
                      <span className="text-xs text-gray-500">Cleared</span>
                    ) : override.is_video ? (
                      <video
                        src={override.image_url}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        autoPlay
                      />
                    ) : (
                      <img
                        src={override.image_url}
                        alt={`Auction #${override.auction_id}`}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">Auction #{override.auction_id}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
                      {override.image_url.trim() === '' ? '(Cleared)' : override.image_url}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      {override.image_url.trim() === '' ? (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          Cleared
                        </span>
                      ) : (
                        override.is_video && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Video
                          </span>
                        )
                      )}
                      <span className="text-xs text-gray-500">
                        Added {new Date(override.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleClear(override.auction_id)}
                  title={override.image_url.trim() === '' ? 'Already cleared' : 'Clear image URL'}
                  disabled={override.image_url.trim() === ''}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
} 