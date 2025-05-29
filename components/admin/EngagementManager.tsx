"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  Users, 
  Target, 
  Heart, 
  Repeat2, 
  UserCheck, 
  Filter, 
  Zap,
  TrendingUp,
  Shield,
  Crown,
  Eye,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Search,
  UserPlus,
  X,
  Star,
  BarChart3,
  PieChart,
  Activity,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Clock
} from "lucide-react";

interface Signer {
  fid: number;
  username: string;
  display_name: string;
  follower_count: number;
  following_count: number;
  neynar_score: number;
  power_badge: boolean;
  permissions: string[];
  pfp_url: string;
  bio: string;
  verified_accounts: Array<{ platform: string; username: string }>;
}

interface EngagementFilters {
  minFollowers: number;
  maxFollowers: number;
  minNeynarScore: number;
  maxNeynarScore: number;
  powerBadgeOnly: boolean;
  verifiedOnly: boolean;
  permissions: string[];
  excludeUsed: boolean;
}

interface EngagementTarget {
  castHash: string;
  numLikes: number;
  numRecasts: number;
  description: string;
  selectedUsers: number[]; // Array of FIDs for manual selection
}

interface RecentExecution {
  id: string;
  castHash: string;
  executedAt: string;
  successful: number;
  failed: number;
  totalActions: number;
  type: 'smart' | 'manual';
}

export function EngagementManager() {
  const { address } = useAccount();
  const [signers, setSigners] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Signer[]>([]);
  const [filters, setFilters] = useState<EngagementFilters>({
    minFollowers: 0,
    maxFollowers: 200000, // Set high enough to include all signers by default
    minNeynarScore: 0,
    maxNeynarScore: 1,
    powerBadgeOnly: false,
    verifiedOnly: false,
    permissions: ['like', 'recast'],
    excludeUsed: true
  });
  
  const [target, setTarget] = useState<EngagementTarget>({
    castHash: '',
    numLikes: 50,
    numRecasts: 25,
    description: '',
    selectedUsers: []
  });
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([]);

  // Fetch available signers
  useEffect(() => {
    if (address) {
      fetchSigners();
      loadRecentExecutions();
    }
  }, [address]);

  // Real-time search
  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = signers.filter(signer => {
        const username = signer.username?.toLowerCase() || '';
        const displayName = signer.display_name?.toLowerCase() || '';
        const fid = signer.fid.toString();
        const query = searchQuery.toLowerCase();
        
        return username.includes(query) ||
               displayName.includes(query) ||
               fid.includes(query);
      }).slice(0, 10); // Limit to 10 results
      setSearchResults(filtered);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, signers]);

  const fetchSigners = async () => {
    if (!address) return;
    
    try {
      const response = await fetch('/api/admin/available-signers', {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch signers');
      
      const data = await response.json();
      console.log('Fetched signers data:', data);
      setSigners(data.signers || []);
      toast.success(`Loaded ${data.signers?.length || 0} signers`);
    } catch (error) {
      console.error('Error fetching signers:', error);
      toast.error('Failed to load signers');
    } finally {
      setLoading(false);
    }
  };

  // Add user to selection
  const addUserToSelection = (fid: number) => {
    if (!target.selectedUsers.includes(fid)) {
      setTarget(prev => ({
        ...prev,
        selectedUsers: [...prev.selectedUsers, fid]
      }));
      toast.success('User added to selection');
    }
  };

  // Remove user from selection
  const removeUserFromSelection = (fid: number) => {
    setTarget(prev => ({
      ...prev,
      selectedUsers: prev.selectedUsers.filter(id => id !== fid)
    }));
  };

  // Get selected users data
  const selectedUsersData = useMemo(() => {
    return target.selectedUsers.map(fid => 
      signers.find(signer => signer.fid === fid)
    ).filter(Boolean) as Signer[];
  }, [target.selectedUsers, signers]);

  // Filter signers based on criteria
  const filteredSigners = useMemo(() => {
    console.log('Filtering signers:', { 
      totalSigners: signers.length, 
      filters,
      sampleSigner: signers[0] 
    });
    
    return signers.filter(signer => {
      // Follower count filter
      if (signer.follower_count < filters.minFollowers || 
          signer.follower_count > filters.maxFollowers) {
        return false;
      }
      
      // Neynar score filter
      if (signer.neynar_score < filters.minNeynarScore || 
          signer.neynar_score > filters.maxNeynarScore) {
        return false;
      }
      
      // Power badge filter
      if (filters.powerBadgeOnly && !signer.power_badge) {
        return false;
      }
      
      // Verified accounts filter
      if (filters.verifiedOnly && (!signer.verified_accounts || signer.verified_accounts.length === 0)) {
        return false;
      }
      
      // Permissions filter - user needs at least ONE of the selected permissions
      const hasAnyRequiredPermission = filters.permissions.some(permission => 
        signer.permissions.includes(permission)
      );
      if (!hasAnyRequiredPermission) {
        return false;
      }
      
      return true;
    });
  }, [signers, filters]);

  // Calculate engagement distribution
  const engagementStats = useMemo(() => {
    const likersPool = filteredSigners.filter(s => s.permissions.includes('like'));
    const recastersPool = filteredSigners.filter(s => s.permissions.includes('recast'));
    
    const avgFollowers = filteredSigners.length > 0 
      ? Math.round(filteredSigners.reduce((sum, s) => sum + s.follower_count, 0) / filteredSigners.length)
      : 0;
    
    const avgScore = filteredSigners.length > 0
      ? (filteredSigners.reduce((sum, s) => sum + s.neynar_score, 0) / filteredSigners.length).toFixed(3)
      : '0';
    
    const powerBadgeCount = filteredSigners.filter(s => s.power_badge).length;
    const verifiedCount = filteredSigners.filter(s => s.verified_accounts && s.verified_accounts.length > 0).length;
    
    return {
      total: filteredSigners.length,
      likersAvailable: likersPool.length,
      recastersAvailable: recastersPool.length,
      avgFollowers,
      avgScore,
      powerBadgeCount,
      verifiedCount,
      canLike: Math.min(target.numLikes, likersPool.length),
      canRecast: Math.min(target.numRecasts, recastersPool.length)
    };
  }, [filteredSigners, target.numLikes, target.numRecasts]);

  // Execute engagement
  const executeEngagement = async () => {
    if (!target.castHash) {
      toast.error('Please enter a cast hash');
      return;
    }
    
    if (target.numLikes === 0 && target.numRecasts === 0 && target.selectedUsers.length === 0) {
      toast.error('Please specify likes/recasts or select specific users');
      return;
    }

    // Preview mode - just show what would happen without executing
    if (previewMode) {
      if (target.selectedUsers.length > 0) {
        toast.info(`Preview: Would execute ${target.selectedUsers.length * 2} actions (likes + recasts) for ${target.selectedUsers.length} selected users`);
      } else {
        toast.info(`Preview: Would execute ${engagementStats.canLike} likes and ${engagementStats.canRecast} recasts for ${engagementStats.canLike + engagementStats.canRecast} total actions`);
      }
      return;
    }
    
    setIsExecuting(true);
    
    try {
      const payload: {
        castHash: string;
        fids?: number[];
        actionType?: string;
        numLikes?: number;
        numRecasts?: number;
      } = {
        castHash: target.castHash,
      };

      // If specific users are selected, use manual mode
      if (target.selectedUsers.length > 0) {
        payload.fids = target.selectedUsers;
        payload.actionType = 'both'; // Both likes and recasts for selected users
      } else {
        // Use smart targeting mode
        payload.numLikes = target.numLikes;
        payload.numRecasts = target.numRecasts;
      }

      const response = await fetch('/api/admin/test-likes-recasts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${address}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error('Failed to execute engagement');
      
      const result = await response.json();
      
      if (target.selectedUsers.length > 0) {
        toast.success(`Manual engagement executed! ${result.successful} successful, ${result.failed} failed for ${target.selectedUsers.length} selected users`);
      } else {
        toast.success(`Smart engagement executed! ${result.successful} successful, ${result.failed} failed`);
      }
      
      // Clear selected users after execution
      setTarget(prev => ({ ...prev, selectedUsers: [] }));
      
      // Refresh signers to update any status changes
      fetchSigners();
      
      // Save execution to localStorage
      saveExecution({
        castHash: target.castHash,
        executedAt: new Date().toISOString(),
        successful: result.successful,
        failed: result.failed,
        totalActions: result.successful + result.failed,
        type: target.selectedUsers.length > 0 ? 'manual' : 'smart'
      });
      
    } catch (error) {
      console.error('Error executing engagement:', error);
      toast.error('Failed to execute engagement');
    } finally {
      setIsExecuting(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      minFollowers: 0,
      maxFollowers: 200000,
      minNeynarScore: 0,
      maxNeynarScore: 1,
      powerBadgeOnly: false,
      verifiedOnly: false,
      permissions: ['like', 'recast'],
      excludeUsed: true
    });
  };

  // Load recent executions from localStorage
  const loadRecentExecutions = () => {
    try {
      const stored = localStorage.getItem('recent-executions');
      if (stored) {
        const executions = JSON.parse(stored) as RecentExecution[];
        // Sort by most recent first and limit to 10
        const sortedExecutions = executions
          .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
          .slice(0, 10);
        setRecentExecutions(sortedExecutions);
      }
    } catch (error) {
      console.error('Error loading recent executions:', error);
    }
  };

  // Save execution to localStorage
  const saveExecution = (execution: Omit<RecentExecution, 'id'>) => {
    try {
      const newExecution: RecentExecution = {
        ...execution,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
      };
      
      const stored = localStorage.getItem('recent-executions');
      const existing = stored ? JSON.parse(stored) as RecentExecution[] : [];
      const updated = [newExecution, ...existing].slice(0, 10); // Keep only last 10
      
      localStorage.setItem('recent-executions', JSON.stringify(updated));
      setRecentExecutions(updated);
    } catch (error) {
      console.error('Error saving execution:', error);
    }
  };

  // Copy cast hash to clipboard
  const copyCastHash = async (castHash: string) => {
    try {
      await navigator.clipboard.writeText(castHash);
      toast.success('Cast hash copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.error('Failed to copy cast hash');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-200 rounded animate-pulse" />
          </div>
  );
}

// Engagement Analytics Component
interface EngagementAnalyticsProps {
  signers: Signer[];
}

interface CastAnalytics {
  castHash: string;
  totalLikes: number;
  totalRecasts: number;
  signerLikes: Signer[];
  signerRecasts: Signer[];
  qualityMetrics: {
    avgFollowers: number;
    avgScore: number;
    powerBadgeCount: number;
    verifiedCount: number;
  };
}

function EngagementAnalytics({ signers }: EngagementAnalyticsProps) {
  const { address } = useAccount();
  const [analyticsCastHash, setAnalyticsCastHash] = useState("");
  const [analytics, setAnalytics] = useState<CastAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeEngagement = async () => {
    if (!analyticsCastHash.trim()) {
      toast.error('Please enter a cast hash to analyze');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      // Fetch analytics from our secure backend API
      const response = await fetch('/api/admin/cast-analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${address}`
        },
        body: JSON.stringify({ castHash: analyticsCastHash })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch engagement data');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to analyze cast');
      }

      const { data } = result;

      // Extract FIDs from the API response
      const likedFids = new Set(data.likedFids || []);
      const recastedFids = new Set(data.recastedFids || []);

      // Find our signers who engaged
      const signerLikes = signers.filter(signer => likedFids.has(signer.fid));
      const signerRecasts = signers.filter(signer => recastedFids.has(signer.fid));

      // Calculate quality metrics for engaged signers
      const allEngagedSigners = [...new Set([...signerLikes, ...signerRecasts])];
      const qualityMetrics = {
        avgFollowers: allEngagedSigners.length > 0 
          ? Math.round(allEngagedSigners.reduce((sum, s) => sum + (s.follower_count || 0), 0) / allEngagedSigners.length)
          : 0,
        avgScore: allEngagedSigners.length > 0
          ? Number((allEngagedSigners.reduce((sum, s) => sum + (s.neynar_score || 0), 0) / allEngagedSigners.length).toFixed(3))
          : 0,
        powerBadgeCount: allEngagedSigners.filter(s => s.power_badge).length,
        verifiedCount: allEngagedSigners.filter(s => s.verified_accounts?.length > 0).length
      };

      setAnalytics({
        castHash: analyticsCastHash,
        totalLikes: data.totalLikes || 0,
        totalRecasts: data.totalRecasts || 0,
        signerLikes,
        signerRecasts,
        qualityMetrics
      });

      toast.success(`Analysis complete! Found ${signerLikes.length} signer likes and ${signerRecasts.length} signer recasts`);

    } catch (err) {
      console.error('Analytics error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze engagement. Please check the cast hash and try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const engagementRate = analytics ? {
    likeRate: signers.length > 0 ? ((analytics.signerLikes.length / signers.length) * 100).toFixed(1) : '0',
    recastRate: signers.length > 0 ? ((analytics.signerRecasts.length / signers.length) * 100).toFixed(1) : '0',
    totalRate: signers.length > 0 ? (((analytics.signerLikes.length + analytics.signerRecasts.length) / (signers.length * 2)) * 100).toFixed(1) : '0'
  } : null;

  return (
    <div className="space-y-6">
      {/* Analytics Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-500" />
            Engagement Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="analyticsCastHash">Cast Hash to Analyze</Label>
              <Input
                id="analyticsCastHash"
                placeholder="0x54ad3e8d6290b0860a17ae63fda8792f2382fb58 (40 hex characters)"
                value={analyticsCastHash}
                onChange={(e) => setAnalyticsCastHash(e.target.value)}
              />
              <div className="text-xs text-gray-500 mt-1">
                Enter a cast hash (0x followed by 40 hex characters). You can find this in the cast URL or by inspecting the cast.
              </div>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={analyzeEngagement}
                disabled={loading || !analyticsCastHash.trim()}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics Results */}
      {analytics && (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Likes</p>
                    <p className="text-2xl font-bold text-red-600">{analytics.totalLikes.toLocaleString()}</p>
                  </div>
                  <Heart className="h-8 w-8 text-red-500" />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {analytics.signerLikes.length} from our signers ({engagementRate?.likeRate}%)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Recasts</p>
                    <p className="text-2xl font-bold text-green-600">{analytics.totalRecasts.toLocaleString()}</p>
                  </div>
                  <Repeat2 className="h-8 w-8 text-green-500" />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {analytics.signerRecasts.length} from our signers ({engagementRate?.recastRate}%)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Our Engagement</p>
                    <p className="text-2xl font-bold text-blue-600">{analytics.signerLikes.length + analytics.signerRecasts.length}</p>
                  </div>
                  <Activity className="h-8 w-8 text-blue-500" />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {engagementRate?.totalRate}% of possible actions
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Quality Score</p>
                    <p className="text-2xl font-bold text-purple-600">{analytics.qualityMetrics.avgScore}</p>
                  </div>
                  <Star className="h-8 w-8 text-purple-500" />
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Avg Neynar score of engaged signers
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Signer Likes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-red-500" />
                  Signers Who Liked ({analytics.signerLikes.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.signerLikes.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {analytics.signerLikes.map((signer) => (
                      <div key={signer.fid} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={signer.pfp_url} alt={signer.display_name || 'User'} />
                            <AvatarFallback className="text-xs">{(signer.display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium">{signer.display_name || 'Unknown'}</span>
                              {signer.power_badge && <Crown className="h-3 w-3 text-yellow-500" />}
                            </div>
                            <div className="text-xs text-gray-500">
                              {signer.follower_count?.toLocaleString() || 0} followers • {signer.neynar_score?.toFixed(2) || '0.00'}
                            </div>
                          </div>
                        </div>
                        <CheckCircle className="h-4 w-4 text-red-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No signers liked this cast</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Signer Recasts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat2 className="h-5 w-5 text-green-500" />
                  Signers Who Recasted ({analytics.signerRecasts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.signerRecasts.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {analytics.signerRecasts.map((signer) => (
                      <div key={signer.fid} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={signer.pfp_url} alt={signer.display_name || 'User'} />
                            <AvatarFallback className="text-xs">{(signer.display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium">{signer.display_name || 'Unknown'}</span>
                              {signer.power_badge && <Crown className="h-3 w-3 text-yellow-500" />}
                            </div>
                            <div className="text-xs text-gray-500">
                              {signer.follower_count?.toLocaleString() || 0} followers • {signer.neynar_score?.toFixed(2) || '0.00'}
                            </div>
                          </div>
                        </div>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Repeat2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No signers recasted this cast</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quality Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-blue-500" />
                Engagement Quality Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{analytics.qualityMetrics.avgFollowers.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Avg Followers</div>
                  <div className="text-xs text-gray-500 mt-1">of engaged signers</div>
                </div>
                
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{analytics.qualityMetrics.avgScore}</div>
                  <div className="text-sm text-gray-600">Avg Quality Score</div>
                  <div className="text-xs text-gray-500 mt-1">Neynar user score</div>
                </div>
                
                <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{analytics.qualityMetrics.powerBadgeCount}</div>
                  <div className="text-sm text-gray-600">Power Badges</div>
                  <div className="text-xs text-gray-500 mt-1">high-quality users</div>
                </div>
                
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{analytics.qualityMetrics.verifiedCount}</div>
                  <div className="text-sm text-gray-600">Verified Accounts</div>
                  <div className="text-xs text-gray-500 mt-1">X/GitHub verified</div>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <h4 className="font-medium">Performance Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span>Like Rate: {engagementRate?.likeRate}% of signers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Recast Rate: {engagementRate?.recastRate}% of signers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span>Overall Rate: {engagementRate?.totalRate}% engagement</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-blue-500" />
            Intelligent Engagement Manager
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Target high-quality users with smart filtering and engagement distribution
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {signers.length} Total Signers
        </Badge>
      </div>

      <Tabs defaultValue="execution" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="execution">⚡ Execution</TabsTrigger>
          <TabsTrigger value="targeting">🎯 Smart Targeting</TabsTrigger>
          <TabsTrigger value="analytics">📊 Analytics</TabsTrigger>
        </TabsList>

        {/* Smart Targeting Tab */}
        <TabsContent value="targeting" className="space-y-6">
          {/* User Search Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Manual User Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by username, display name, or FID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {searchResults.map((user) => (
                    <div
                      key={user.fid}
                      className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer transition-all duration-200 ${
                        target.selectedUsers.includes(user.fid)
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => target.selectedUsers.includes(user.fid) 
                        ? removeUserFromSelection(user.fid)
                        : addUserToSelection(user.fid)
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.pfp_url} alt={user.display_name || 'User'} />
                          <AvatarFallback>{(user.display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{user.display_name || 'Unknown'}</span>
                            {user.power_badge && <Crown className="h-3 w-3 text-yellow-500" />}
                            {user.verified_accounts?.length > 0 && <Shield className="h-3 w-3 text-green-500" />}
                          </div>
                          <div className="text-sm text-gray-500">
                            @{user.username || 'unknown'} • {user.follower_count?.toLocaleString() || 0} followers • {user.neynar_score?.toFixed(2) || '0.00'} score
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {target.selectedUsers.includes(user.fid) ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Selected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="opacity-60">
                            <UserPlus className="h-3 w-3 mr-1" />
                            Click to add
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Selected Users */}
              {selectedUsersData.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    Selected Users ({selectedUsersData.length})
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedUsersData.map((user) => (
                      <Badge
                        key={user.fid}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={user.pfp_url} alt={user.display_name || 'User'} />
                          <AvatarFallback className="text-xs">{(user.display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{user.username || 'unknown'}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-red-100"
                          onClick={() => removeUserFromSelection(user.fid)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Quality Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Follower Range */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Follower Count: {filters.minFollowers.toLocaleString()} - {filters.maxFollowers.toLocaleString()}
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-8">Min</span>
                                             <Slider
                         value={[filters.minFollowers]}
                         onValueChange={([value]: number[]) => setFilters(prev => ({ ...prev, minFollowers: value }))}
                         max={200000}
                         step={100}
                         className="flex-1"
                       />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-8">Max</span>
                                              <Slider
                          value={[filters.maxFollowers]}
                          onValueChange={([value]) => setFilters(prev => ({ ...prev, maxFollowers: value }))}
                          max={200000}
                          step={100}
                          className="flex-1"
                        />
                    </div>
                  </div>
                </div>

                {/* Neynar Score Range */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Neynar Score: {filters.minNeynarScore.toFixed(2)} - {filters.maxNeynarScore.toFixed(2)}
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-8">Min</span>
                      <Slider
                        value={[filters.minNeynarScore]}
                        onValueChange={([value]) => setFilters(prev => ({ ...prev, minNeynarScore: value }))}
                        max={1}
                        step={0.01}
                        className="flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-8">Max</span>
                      <Slider
                        value={[filters.maxNeynarScore]}
                        onValueChange={([value]) => setFilters(prev => ({ ...prev, maxNeynarScore: value }))}
                        max={1}
                        step={0.01}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Quality Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-yellow-500" />
                      Power Badge Only
                    </Label>
                    <Switch
                      checked={filters.powerBadgeOnly}
                      onCheckedChange={(checked) => setFilters(prev => ({ ...prev, powerBadgeOnly: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-500" />
                      Verified Accounts Only
                    </Label>
                    <Switch
                      checked={filters.verifiedOnly}
                      onCheckedChange={(checked) => setFilters(prev => ({ ...prev, verifiedOnly: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-500" />
                      Exclude Recently Used
                    </Label>
                    <Switch
                      checked={filters.excludeUsed}
                      onCheckedChange={(checked) => setFilters(prev => ({ ...prev, excludeUsed: checked }))}
                    />
                  </div>
                </div>

                <Button onClick={resetFilters} variant="outline" className="w-full">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Filters
                </Button>
              </CardContent>
            </Card>

            {/* Preview Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Targeting Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{engagementStats.total}</div>
                    <div className="text-sm text-gray-600">Qualified Users</div>
                  </div>
                  
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{engagementStats.avgFollowers.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Avg Followers</div>
                  </div>
                  
                  <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{engagementStats.avgScore}</div>
                    <div className="text-sm text-gray-600">Avg Score</div>
                  </div>
                  
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">{engagementStats.powerBadgeCount}</div>
                    <div className="text-sm text-gray-600">Power Badges</div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-500" />
                      Available for Likes
                    </span>
                    <Badge variant="secondary">{engagementStats.likersAvailable}</Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <Repeat2 className="h-4 w-4 text-green-500" />
                      Available for Recasts
                    </span>
                    <Badge variant="secondary">{engagementStats.recastersAvailable}</Badge>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-blue-500" />
                      Verified Accounts
                    </span>
                    <Badge variant="secondary">{engagementStats.verifiedCount}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Advanced Quality Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Quality Score Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {filteredSigners.filter(s => s.neynar_score >= 0.8).length}
                  </div>
                  <div className="text-sm text-gray-600">Premium (0.8+)</div>
                  <div className="text-xs text-gray-500">Top tier users</div>
                </div>
                
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {filteredSigners.filter(s => s.neynar_score >= 0.6 && s.neynar_score < 0.8).length}
                  </div>
                  <div className="text-sm text-gray-600">High (0.6-0.8)</div>
                  <div className="text-xs text-gray-500">Quality users</div>
                </div>
                
                <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {filteredSigners.filter(s => s.neynar_score >= 0.4 && s.neynar_score < 0.6).length}
                  </div>
                  <div className="text-sm text-gray-600">Medium (0.4-0.6)</div>
                  <div className="text-xs text-gray-500">Average users</div>
                </div>
                
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {filteredSigners.filter(s => s.neynar_score < 0.4).length}
                  </div>
                  <div className="text-sm text-gray-600">Basic (&lt;0.4)</div>
                  <div className="text-xs text-gray-500">Entry level</div>
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center justify-between">
                  <span>Engagement Rate Estimate:</span>
                  <Badge variant="outline">
                    {((engagementStats.canLike + engagementStats.canRecast) / Math.max(1, engagementStats.total * 2) * 100).toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Quality Score:</span>
                  <Badge variant="outline" className={
                    Number(engagementStats.avgScore) >= 0.7 ? 'bg-green-100 text-green-800' :
                    Number(engagementStats.avgScore) >= 0.5 ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }>
                    {Number(engagementStats.avgScore) >= 0.7 ? '🔥 Excellent' :
                     Number(engagementStats.avgScore) >= 0.5 ? '✨ Good' : '⚡ Fair'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Reach Potential:</span>
                  <Badge variant="outline">
                    {(engagementStats.avgFollowers * (engagementStats.canLike + engagementStats.canRecast)).toLocaleString()} impressions
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Execution Tab */}
        <TabsContent value="execution" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Target Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Engagement Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="castHash">Cast Hash</Label>
                  <Input
                    id="castHash"
                    placeholder="0x..."
                    value={target.castHash}
                    onChange={(e) => setTarget(prev => ({ ...prev, castHash: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label htmlFor="numLikes">Likes: {target.numLikes}</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max={engagementStats.likersAvailable}
                          value={target.numLikes}
                          onChange={(e) => {
                            const value = Math.min(Math.max(0, parseInt(e.target.value) || 0), engagementStats.likersAvailable);
                            setTarget(prev => ({ ...prev, numLikes: value }));
                          }}
                          className="w-20"
                        />
                        <Slider
                          value={[target.numLikes]}
                          onValueChange={([value]) => setTarget(prev => ({ ...prev, numLikes: value }))}
                          max={engagementStats.likersAvailable}
                          step={1}
                          className="flex-1"
                        />
                      </div>
                      <div className="text-xs text-gray-500">
                        Max available: {engagementStats.likersAvailable}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="numRecasts">Recasts: {target.numRecasts}</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max={engagementStats.recastersAvailable}
                          value={target.numRecasts}
                          onChange={(e) => {
                            const value = Math.min(Math.max(0, parseInt(e.target.value) || 0), engagementStats.recastersAvailable);
                            setTarget(prev => ({ ...prev, numRecasts: value }));
                          }}
                          className="w-20"
                        />
                        <Slider
                          value={[target.numRecasts]}
                          onValueChange={([value]) => setTarget(prev => ({ ...prev, numRecasts: value }))}
                          max={engagementStats.recastersAvailable}
                          step={1}
                          className="flex-1"
                        />
                      </div>
                      <div className="text-xs text-gray-500">
                        Max available: {engagementStats.recastersAvailable}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">Preview Mode</span>
                  </div>
                  <Switch
                    checked={previewMode}
                    onCheckedChange={setPreviewMode}
                  />
                </div>

                {/* Recent Executions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-gray-500" />
                    Recent Executions
                  </div>
                  {recentExecutions.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <p className="text-xs">No recent executions</p>
                      <p className="text-xs text-gray-400">Execute an engagement to see it here</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {recentExecutions.map((execution) => (
                        <div key={execution.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={execution.type === 'smart' ? 'default' : 'secondary'} className="text-xs">
                                {execution.type === 'smart' ? 'Smart' : 'Manual'}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {new Date(execution.executedAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                                {execution.castHash.slice(0, 12)}...{execution.castHash.slice(-8)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0 hover:bg-blue-100"
                                onClick={() => copyCastHash(execution.castHash)}
                                title="Copy full cast hash"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <span className="text-xs text-green-600">
                                ✓ {execution.successful}
                              </span>
                              {execution.failed > 0 && (
                                <span className="text-xs text-red-600">
                                  ✗ {execution.failed}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Execution Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Execution Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {target.selectedUsers.length > 0 ? (
                  /* Manual Selection Mode */
                  <div className="space-y-3">
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">Manual Selection Mode</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {target.selectedUsers.length} users selected for both likes and recasts
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <span className="text-sm font-medium">Total Actions</span>
                      <Badge variant="outline">
                        {target.selectedUsers.length * 2} (likes + recasts)
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Selected Users Quality:</div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>• Avg {selectedUsersData.length > 0 ? Math.round(selectedUsersData.reduce((sum, u) => sum + u.follower_count, 0) / selectedUsersData.length).toLocaleString() : 0} followers</div>
                        <div>• Avg {selectedUsersData.length > 0 ? (selectedUsersData.reduce((sum, u) => sum + u.neynar_score, 0) / selectedUsersData.length).toFixed(3) : '0'} Neynar score</div>
                        <div>• {selectedUsersData.filter(u => u.power_badge).length} power badge holders</div>
                        <div>• {selectedUsersData.filter(u => u.verified_accounts?.length > 0).length} verified accounts</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Smart Targeting Mode */
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <span className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-red-500" />
                        Likes to Send
                      </span>
                      <Badge variant="destructive">{engagementStats.canLike}</Badge>
                    </div>
                    
                    <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <span className="flex items-center gap-2">
                        <Repeat2 className="h-4 w-4 text-green-500" />
                        Recasts to Send
                      </span>
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        {engagementStats.canRecast}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <span className="text-sm font-medium">Total Actions</span>
                      <Badge variant="outline">
                        {engagementStats.canLike + engagementStats.canRecast}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Quality Distribution:</div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>• Avg {engagementStats.avgFollowers.toLocaleString()} followers per user</div>
                        <div>• Avg {engagementStats.avgScore} Neynar score</div>
                        <div>• {engagementStats.powerBadgeCount} power badge holders</div>
                        <div>• {engagementStats.verifiedCount} verified accounts</div>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                <Button 
                  onClick={executeEngagement}
                  disabled={isExecuting || !target.castHash || (target.numLikes === 0 && target.numRecasts === 0 && target.selectedUsers.length === 0)}
                  className="w-full"
                  size="lg"
                  variant={previewMode ? "outline" : "default"}
                >
                  {isExecuting ? (
                    <>
                      <Pause className="h-4 w-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : previewMode ? (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Show Preview
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Execute Engagement
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <EngagementAnalytics signers={signers} />
        </TabsContent>
      </Tabs>
    </div>
  );
} 