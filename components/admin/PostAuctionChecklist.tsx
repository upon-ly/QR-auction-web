"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle2, Trash2, ExternalLink, Users, Image, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { UploadButton } from '@/utils/uploadthing';
import { addAuctionImageOverride, removeAuctionImageOverride, getAuctionImage, isAuctionImageVideo } from '@/utils/auctionImageOverrides';
import { WarpcastLogo } from '@/components/WarpcastLogo';
import { XLogo } from '@/components/XLogo';

// Admin address list for authorization
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  automated: boolean;
}

interface PostAuctionData {
  auctionId: number;
  winner: {
    address: string;
    amount: number;
    url: string;
    displayName?: string;
    farcasterUsername?: string;
    twitterUsername?: string;
    basename?: string;
    ensName?: string;
  };
  quoteCast?: {
    url: string;
    replacement?: string;
  };
  quoteTweet?: {
    url: string;
    replacement?: string;
  };
  imageOverride?: {
    url: string;
    isVideo: boolean;
  };
}

export function PostAuctionChecklist() {
  const { address } = useAccount();
  const { getAccessToken } = usePrivy();
  const [latestWonAuctionId, setLatestWonAuctionId] = useState<number>(0);
  const [auctionData, setAuctionData] = useState<PostAuctionData | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    {
      id: 'winner-insertion',
      title: 'Winner Database Entry',
      description: 'Automatically insert winner data into winners table',
      completed: false,
      automated: true
    },
    {
      id: 'quote-cast-management',
      title: 'Quote Cast Management',
      description: 'Replace or remove quote cast references',
      completed: false,
      automated: false
    },
    {
      id: 'quote-tweet-management', 
      title: 'Quote Tweet Management',
      description: 'Replace or remove quote tweet references',
      completed: false,
      automated: false
    },
    {
      id: 'image-override',
      title: 'Auction Image Override',
      description: 'Upload and set custom image/video for auction',
      completed: false,
      automated: false
    }
  ]);
  
  // Quote management state
  const [quoteCastUrl, setQuoteCastUrl] = useState('');
  const [quoteCastReplacement, setQuoteCastReplacement] = useState('');
  const [quoteTweetUrl, setQuoteTweetUrl] = useState('');
  const [quoteTweetReplacement, setQuoteTweetReplacement] = useState('');
  
  // Image override state
  const [imageOverrideUrl, setImageOverrideUrl] = useState('');
  const [isVideoOverride, setIsVideoOverride] = useState(false);
  const [currentImageOverride, setCurrentImageOverride] = useState<string | null>(null);
  const [isCurrentOverrideVideo, setIsCurrentOverrideVideo] = useState(false);
  
  // Loading states
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadingSocialLinks, setLoadingSocialLinks] = useState(false);
  const [loadingLatestAuction, setLoadingLatestAuction] = useState(true);

  // Check admin authorization
  const isAuthorized = address && ADMIN_ADDRESSES.includes(address.toLowerCase());

  // Fetch latest won auction ID
  const fetchLatestWonAuction = useCallback(async () => {
    setLoadingLatestAuction(true);
    try {
      const response = await fetch('/api/winners');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
          // Get the latest auction ID (first item since it's ordered by token_id desc)
          const latestId = parseInt(result.data[0].token_id);
          setLatestWonAuctionId(latestId);
          
          // Automatically fetch data for this auction
          fetchAuctionData(latestId);
        }
      }
    } catch (error) {
      console.error('Error fetching latest won auction:', error);
      toast.error('Failed to fetch latest won auction');
    } finally {
      setLoadingLatestAuction(false);
    }
  }, []);

  // Load current social links on component mount
  useEffect(() => {
    const loadSocialLinks = async () => {
      try {
        const response = await fetch('/api/social-links');
        if (response.ok) {
          const data = await response.json();
          console.log('Social links data:', data); // Debug log
          
          setQuoteTweetUrl(data.quoteTweetUrl || '');
          setQuoteCastUrl(data.quoteCastUrl || '');
          
          // Mark checklist items as completed if URLs exist and are not empty
          const hasQuoteCast = data.quoteCastUrl && data.quoteCastUrl.trim() !== '';
          const hasQuoteTweet = data.quoteTweetUrl && data.quoteTweetUrl.trim() !== '';
          
          console.log('Has quote cast:', hasQuoteCast, 'URL:', data.quoteCastUrl); // Debug log
          console.log('Has quote tweet:', hasQuoteTweet, 'URL:', data.quoteTweetUrl); // Debug log
          
          setChecklist(prev => prev.map(item => {
            if (item.id === 'quote-cast-management') {
              return { ...item, completed: hasQuoteCast };
            }
            if (item.id === 'quote-tweet-management') {
              return { ...item, completed: hasQuoteTweet };
            }
            return item;
          }));
        } else {
          console.error('Failed to fetch social links:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error loading social links:', error);
      }
    };

    loadSocialLinks();
  }, []);

  // Fetch latest won auction on component mount
  useEffect(() => {
    fetchLatestWonAuction();
  }, [fetchLatestWonAuction]);

  // Fetch auction and winner data
  const fetchAuctionData = useCallback(async (auctionId: number) => {
    if (!auctionId || auctionId <= 0) return;
    
    try {
      // Fetch winner data from API
      const response = await fetch(`/api/winners`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const winner = result.data.find((w: { token_id: string }) => parseInt(w.token_id) === auctionId);
          
          if (winner) {
            setAuctionData({
              auctionId,
              winner: {
                address: winner.winner_address,
                amount: winner.amount,
                url: winner.url,
                displayName: winner.display_name,
                farcasterUsername: winner.farcaster_username,
                twitterUsername: winner.twitter_username,
                basename: winner.basename,
                ensName: winner.ens_name
              }
            });
            
            // Mark winner insertion as completed if data exists
            setChecklist(prev => prev.map(item => 
              item.id === 'winner-insertion' 
                ? { ...item, completed: true }
                : item
            ));
          } else {
            setAuctionData({
              auctionId,
              winner: {
                address: '',
                amount: 0,
                url: ''
              }
            });
          }
        }
      }

      // Fetch current image override for this auction
      const currentOverride = await getAuctionImage(auctionId);
      const isVideo = await isAuctionImageVideo(auctionId);
      
      setCurrentImageOverride(currentOverride);
      setIsCurrentOverrideVideo(isVideo);
      
      // Mark image override as completed if an override exists
      setChecklist(prev => prev.map(item => 
        item.id === 'image-override' 
          ? { ...item, completed: currentOverride !== null }
          : item
      ));

    } catch (error) {
      console.error('Error fetching auction data:', error);
      toast.error('Failed to fetch auction data');
    }
  }, []);

  // Toggle checklist item completion
  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  // Handle quote cast management
  const handleQuoteCastManagement = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoadingSocialLinks(true);
    try {
      // Get Privy access token for authentication
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        toast.error('Please sign in to perform this action');
        return;
      }

      const response = await fetch('/api/social-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          quoteTweetUrl: quoteTweetUrl || null,
          quoteCastUrl: quoteCastReplacement || quoteCastUrl || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        setQuoteCastUrl(result.quoteCastUrl || '');
        
        // Mark as completed if URL exists and is not empty
        const hasQuoteCast = result.quoteCastUrl && result.quoteCastUrl.trim() !== '';
        setChecklist(prev => prev.map(item => 
          item.id === 'quote-cast-management' 
            ? { ...item, completed: hasQuoteCast }
            : item
        ));
        
        toast.success('Quote cast updated successfully');
      } else {
        const error = await response.json();
        toast.error(`Failed to update quote cast: ${error.error}`);
      }
    } catch (error) {
      console.error('Error managing quote cast:', error);
      toast.error('Failed to manage quote cast');
    } finally {
      setLoadingSocialLinks(false);
    }
  };

  // Handle quote tweet management
  const handleQuoteTweetManagement = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoadingSocialLinks(true);
    try {
      // Get Privy access token for authentication
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        toast.error('Please sign in to perform this action');
        return;
      }

      const response = await fetch('/api/social-links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          quoteTweetUrl: quoteTweetReplacement || quoteTweetUrl || null,
          quoteCastUrl: quoteCastUrl || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        setQuoteTweetUrl(result.quoteTweetUrl || '');
        
        // Mark as completed if URL exists and is not empty
        const hasQuoteTweet = result.quoteTweetUrl && result.quoteTweetUrl.trim() !== '';
        setChecklist(prev => prev.map(item => 
          item.id === 'quote-tweet-management' 
            ? { ...item, completed: hasQuoteTweet }
            : item
        ));
        
        toast.success('Quote tweet updated successfully');
      } else {
        const error = await response.json();
        toast.error(`Failed to update quote tweet: ${error.error}`);
      }
    } catch (error) {
      console.error('Error managing quote tweet:', error);
      toast.error('Failed to manage quote tweet');
    } finally {
      setLoadingSocialLinks(false);
    }
  };

  // Handle image override upload
  const handleImageOverride = async () => {
    if (!imageOverrideUrl || !latestWonAuctionId) {
      toast.error('Please upload an image first');
      return;
    }

    try {
      setUploadingImage(true);
      
      // Update the latest won auction
      const latestWonSuccess = await addAuctionImageOverride(
        latestWonAuctionId,
        imageOverrideUrl,
        isVideoOverride
      );

      // Also update the next auction (current running auction) - always attempt this
      const nextAuctionId = latestWonAuctionId + 1;
      const nextAuctionSuccess = await addAuctionImageOverride(
        nextAuctionId,
        imageOverrideUrl,
        isVideoOverride
      );

      // Handle results
      if (latestWonSuccess && nextAuctionSuccess) {
        // Both succeeded
        const newOverride = await getAuctionImage(latestWonAuctionId);
        const newIsVideo = await isAuctionImageVideo(latestWonAuctionId);
        setCurrentImageOverride(newOverride);
        setIsCurrentOverrideVideo(newIsVideo);
        
        toast.success(`Image override set for auctions #${latestWonAuctionId} and #${nextAuctionId}`);
        toggleChecklistItem('image-override');
      } else if (latestWonSuccess && !nextAuctionSuccess) {
        // Only latest won succeeded
        const newOverride = await getAuctionImage(latestWonAuctionId);
        const newIsVideo = await isAuctionImageVideo(latestWonAuctionId);
        setCurrentImageOverride(newOverride);
        setIsCurrentOverrideVideo(newIsVideo);
        
        toast.success(`Image override set for auction #${latestWonAuctionId} (current running auction #${nextAuctionId} failed)`);
        toggleChecklistItem('image-override');
      } else if (!latestWonSuccess && nextAuctionSuccess) {
        // Only current running succeeded
        toast.success(`Image override set for current running auction #${nextAuctionId} (latest won auction #${latestWonAuctionId} failed)`);
        toggleChecklistItem('image-override');
      } else {
        // Both failed
        toast.error(`Failed to set image override for both auctions #${latestWonAuctionId} and #${nextAuctionId}`);
      }
    } catch (error) {
      console.error('Error setting image override:', error);
      toast.error('Failed to set image override');
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle image override removal
  const handleRemoveImageOverride = async () => {
    if (!latestWonAuctionId) {
      toast.error('No auction selected');
      return;
    }

    try {
      // Remove from both latest won auction and next auction
      const latestWonSuccess = await removeAuctionImageOverride(latestWonAuctionId);
      const nextAuctionId = latestWonAuctionId + 1;
      const nextAuctionSuccess = await removeAuctionImageOverride(nextAuctionId);
      
      if (latestWonSuccess || nextAuctionSuccess) {
        // Refresh current override display
        setCurrentImageOverride(null);
        setIsCurrentOverrideVideo(false);
        setImageOverrideUrl('');
        setIsVideoOverride(false);
        
        if (latestWonSuccess && nextAuctionSuccess) {
          toast.success(`Image override removed from auctions #${latestWonAuctionId} and #${nextAuctionId}`);
        } else if (latestWonSuccess) {
          toast.success(`Image override removed from auction #${latestWonAuctionId} (next auction not found)`);
        } else {
          toast.success(`Image override removed from auction #${nextAuctionId} (latest won not found)`);
        }
        
        // Update checklist
        setChecklist(prev => prev.map(item => 
          item.id === 'image-override' 
            ? { ...item, completed: false }
            : item
        ));
      } else {
        toast.error('Failed to remove image override');
      }
    } catch (error) {
      console.error('Error removing image override:', error);
      toast.error('Failed to remove image override');
    }
  };

  // Calculate completion percentage
  const completionPercentage = Math.round(
    (checklist.filter(item => item.completed).length / checklist.length) * 100
  );

  if (!isAuthorized) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>You must be an authorized admin to access the post-auction checklist.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Post-Auction Checklist Manager
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Latest Won Auction:</Label>
              {loadingLatestAuction ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    #{latestWonAuctionId}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchLatestWonAuction}
                    disabled={loadingLatestAuction}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <Badge variant={completionPercentage === 100 ? "default" : "secondary"}>
              {completionPercentage}% Complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {auctionData && (
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">Auction #{auctionData.auctionId} Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Winner:</span> 
                  <div className="flex items-center gap-1">
                    <span>
                      {
                        auctionData.winner.displayName || 
                        (auctionData.winner.farcasterUsername ? `@${auctionData.winner.farcasterUsername}` : null) ||
                        (auctionData.winner.twitterUsername ? `@${auctionData.winner.twitterUsername}` : null) ||
                        auctionData.winner.basename ||
                        auctionData.winner.ensName ||
                        auctionData.winner.address ||
                        'Unknown'
                      }
                    </span>
                    {auctionData.winner.twitterUsername ? (
                      <XLogo 
                        size="sm" 
                        username={auctionData.winner.twitterUsername} 
                        className="opacity-80 hover:opacity-100"
                      />
                    ) : auctionData.winner.farcasterUsername && (
                      <WarpcastLogo 
                        size="md" 
                        username={auctionData.winner.farcasterUsername} 
                        className="opacity-80 hover:opacity-100"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Amount:</span> {auctionData.winner.amount}
                </div>
                <div className="col-span-2">
                  <span className="font-medium">URL:</span> 
                  <a 
                    href={auctionData.winner.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-1 text-blue-600 hover:underline"
                  >
                    {auctionData.winner.url}
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleChecklistItem(item.id)}
                    className="p-1"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <div className="h-5 w-5 border-2 rounded-full" />
                    )}
                  </Button>
                  <div>
                    <h4 className="font-medium">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.automated && <Badge variant="outline">Auto</Badge>}
                  {item.completed && <Badge variant="default">Done</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="social" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="social" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Social Management
          </TabsTrigger>
          <TabsTrigger value="media" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Media Override
          </TabsTrigger>
          <TabsTrigger value="winners" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Winners
          </TabsTrigger>
        </TabsList>

        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote Cast Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="quote-cast-url">Quote Cast URL</Label>
                <Input
                  id="quote-cast-url"
                  value={quoteCastUrl}
                  onChange={(e) => setQuoteCastUrl(e.target.value)}
                  placeholder="https://warpcast.com/..."
                />
              </div>
              <div>
                <Label htmlFor="quote-cast-replacement">Replacement URL (optional)</Label>
                <Input
                  id="quote-cast-replacement"
                  value={quoteCastReplacement}
                  onChange={(e) => setQuoteCastReplacement(e.target.value)}
                  placeholder="Leave empty to remove"
                />
              </div>
              <Button onClick={handleQuoteCastManagement} className="w-full" disabled={loadingSocialLinks}>
                {loadingSocialLinks ? 'Updating...' : 'Update Quote Cast'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quote Tweet Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="quote-tweet-url">Quote Tweet URL</Label>
                <Input
                  id="quote-tweet-url"
                  value={quoteTweetUrl}
                  onChange={(e) => setQuoteTweetUrl(e.target.value)}
                  placeholder="https://x.com/..."
                />
              </div>
              <div>
                <Label htmlFor="quote-tweet-replacement">Replacement URL (optional)</Label>
                <Input
                  id="quote-tweet-replacement"
                  value={quoteTweetReplacement}
                  onChange={(e) => setQuoteTweetReplacement(e.target.value)}
                  placeholder="Leave empty to remove"
                />
              </div>
              <Button onClick={handleQuoteTweetManagement} className="w-full" disabled={loadingSocialLinks}>
                {loadingSocialLinks ? 'Updating...' : 'Update Quote Tweet'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Auction Image Override</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Display current image override */}
              {currentImageOverride && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Current Override:</Label>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={isCurrentOverrideVideo ? "secondary" : "outline"}>
                        {isCurrentOverrideVideo ? "Video" : "Image"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveImageOverride}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {isCurrentOverrideVideo ? (
                      <video 
                        src={currentImageOverride} 
                        controls 
                        className="w-full max-w-sm rounded"
                      />
                    ) : (
                      <img 
                        src={currentImageOverride} 
                        alt="Current override" 
                        className="w-full max-w-sm rounded"
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-2 break-all">
                      {currentImageOverride}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label>Upload New Image/Video</Label>
                <UploadButton
                  endpoint="auctionImageUploader"
                  className="ut-button:bg-blue-600 ut-button:hover:bg-blue-500 ut-allowed-content:text-muted-foreground"
                  appearance={{
                    button: "bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md transition-colors",
                    allowedContent: "text-sm text-muted-foreground mt-2"
                  }}
                  headers={async (): Promise<Record<string, string>> => {
                    console.log('UploadButton - Getting access token...');
                    const accessToken = await getAccessToken();
                    console.log('UploadButton - Access token:', accessToken ? 'Present' : 'Missing');
                    console.log('UploadButton - Token length:', accessToken?.length || 0);
                    if (accessToken) {
                      return { authorization: `Bearer ${accessToken}` };
                    }
                    return {};
                  }}
                  onClientUploadComplete={(res) => {
                    if (res?.[0]?.url) {
                      setImageOverrideUrl(res[0].url);
                      const isVideo = res[0].name?.toLowerCase().includes('.mp4') || 
                                     res[0].name?.toLowerCase().includes('.webm') ||
                                     res[0].name?.toLowerCase().includes('.mov');
                      setIsVideoOverride(isVideo || false);
                      toast.success('File uploaded successfully!');
                    }
                  }}
                  onUploadError={(error: Error) => {
                    toast.error(`Upload failed: ${error.message}`);
                  }}
                />
              </div>

              {imageOverrideUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isVideoOverride}
                      onCheckedChange={setIsVideoOverride}
                    />
                    <Label>Is Video</Label>
                  </div>
                  
                  <div className="p-2 bg-muted rounded">
                    <p className="text-sm font-medium">Preview:</p>
                    {isVideoOverride ? (
                      <video 
                        src={imageOverrideUrl} 
                        controls 
                        className="w-full max-w-sm rounded mt-2"
                      />
                    ) : (
                      <img 
                        src={imageOverrideUrl} 
                        alt="Override preview" 
                        className="w-full max-w-sm rounded mt-2"
                      />
                    )}
                  </div>
                </div>
              )}

              <Button 
                onClick={handleImageOverride} 
                disabled={!imageOverrideUrl || uploadingImage}
                className="w-full"
              >
                {uploadingImage ? 'Setting...' : 'Set Image Override'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="winners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Winner Information</CardTitle>
            </CardHeader>
            <CardContent>
              {auctionData ? (
                <div className="space-y-2">
                  <div><strong>Address:</strong> {auctionData.winner.address}</div>
                  <div><strong>Amount:</strong> {auctionData.winner.amount}</div>
                  <div><strong>URL:</strong> 
                    <a 
                      href={auctionData.winner.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ml-1 text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      {auctionData.winner.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {auctionData.winner.displayName && (
                    <div><strong>Display Name:</strong> {auctionData.winner.displayName}</div>
                  )}
                  {auctionData.winner.farcasterUsername && (
                    <div><strong>Farcaster:</strong> @{auctionData.winner.farcasterUsername}</div>
                  )}
                  {auctionData.winner.twitterUsername && (
                    <div><strong>Twitter:</strong> @{auctionData.winner.twitterUsername}</div>
                  )}
                  {auctionData.winner.basename && (
                    <div><strong>Basename:</strong> {auctionData.winner.basename}</div>
                  )}
                  {auctionData.winner.ensName && (
                    <div><strong>ENS:</strong> {auctionData.winner.ensName}</div>
                  )}
                </div>
              ) : (
                <p>Loading winner information...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 