import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Count of all valid tokens (including both enabled and disabled)
    const { count: totalTokens, error: totalTokensError } = await supabase
      .from('notification_tokens')
      .select('*', { count: 'exact', head: true })
      .or('status.eq.enabled,status.eq.disabled');
    
    if (totalTokensError) throw totalTokensError;
    
    // Get the count of enabled tokens
    const { count: enabledTokens, error: enabledTokensError } = await supabase
      .from('notification_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'enabled');
    
    if (enabledTokensError) throw enabledTokensError;
    
    // Calculate disabled tokens
    const disabledTokens = (totalTokens || 0) - (enabledTokens || 0);
    
    // Count of users with frame added
    const { count: frameUsersCount, error: frameUsersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .not('timestamp_added_frame', 'is', null);
    
    if (frameUsersError) throw frameUsersError;
    
    // Users added in the last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const { count: recentUsersCount, error: recentUsersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('timestamp_added_frame', oneWeekAgo.toISOString());
    
    if (recentUsersError) throw recentUsersError;
    
    // Get daily frame additions since the beginning
    const { data: dailyFrameAdds, error: dailyFrameAddsError } = await supabase
      .from('users')
      .select('timestamp_added_frame')
      .not('timestamp_added_frame', 'is', null)
      .order('timestamp_added_frame', { ascending: true });
    
    if (dailyFrameAddsError) throw dailyFrameAddsError;
    
    // Convert to daily counts
    const dailyCounts: Record<string, number> = {};
    dailyFrameAdds.forEach(user => {
      if (!user.timestamp_added_frame) return;
      
      // Format date as YYYY-MM-DD
      const date = new Date(user.timestamp_added_frame).toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });
    
    // Convert to sorted array with running total
    type DailyData = {
      date: string;
      newUsers: number;
      total: number;
    };
    
    const dailyGrowth: DailyData[] = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, newUsers: count, total: 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Add running total
    let runningTotal = 0;
    dailyGrowth.forEach(day => {
      runningTotal += day.newUsers;
      day.total = runningTotal;
    });
    
    // Total stats for users and tokens
    const response = {
      totalFrameUsers: frameUsersCount || 0,
      usersAddedLastWeek: recentUsersCount || 0,
      tokens: {
        total: totalTokens || 0,
        enabled: enabledTokens || 0,
        disabled: disabledTokens
      },
      dailyGrowth
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching Farcaster metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Farcaster metrics' },
      { status: 500 }
    );
  }
}