import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';
const NEYNAR_API_URL = 'https://api.neynar.com/v2';

interface ServiceStatus {
  status: string;
  responseTime: number;
  error?: string;
}

interface EnvironmentStatus {
  status: string;
  responseTime: number;
  variables: {
    total?: number;
    missing?: number;
    missingVars?: string[];
  };
}

export async function GET() {
  const startTime = Date.now();
  const healthCheck = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {
      database: { status: 'unknown', responseTime: 0 } as ServiceStatus,
      neynar: { status: 'unknown', responseTime: 0 } as ServiceStatus,
      environment: { status: 'unknown', responseTime: 0, variables: {} } as EnvironmentStatus
    },
    metrics: {
      totalSigners: 0,
      approvedSigners: 0,
      recentCampaigns: 0
    }
  };

  try {
    // Check database connection
    const dbStart = Date.now();
    try {
      const { data, error } = await supabase
        .from('neynar_signers')
        .select('count(*)', { count: 'exact' })
        .limit(1);
      
      if (error) throw error;
      
      healthCheck.services.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart
      };
      
      // Get metrics
      const { count: approvedCount } = await supabase
        .from('neynar_signers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');
      
      const { count: recentCampaignsCount } = await supabase
        .from('auto_engagement_logs')
        .select('*', { count: 'exact', head: true })
        .gte('processed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      healthCheck.metrics = {
        totalSigners: data?.length || 0,
        approvedSigners: approvedCount || 0,
        recentCampaigns: recentCampaignsCount || 0
      };
      
    } catch (dbError) {
      healthCheck.services.database = {
        status: 'unhealthy',
        responseTime: Date.now() - dbStart,
        error: String(dbError)
      };
      healthCheck.status = 'degraded';
    }

    // Check Neynar API
    const neynarStart = Date.now();
    try {
      const response = await fetch(`${NEYNAR_API_URL}/farcaster/user/bulk?fids=1`, {
        headers: { 'api_key': NEYNAR_API_KEY }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      healthCheck.services.neynar = {
        status: 'healthy',
        responseTime: Date.now() - neynarStart
      };
    } catch (neynarError) {
      healthCheck.services.neynar = {
        status: 'unhealthy',
        responseTime: Date.now() - neynarStart,
        error: String(neynarError)
      };
      healthCheck.status = 'degraded';
    }

    // Check environment variables
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEYNAR_API_KEY'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    healthCheck.services.environment = {
      status: missingVars.length === 0 ? 'healthy' : 'unhealthy',
      responseTime: 0,
      variables: {
        total: requiredEnvVars.length,
        missing: missingVars.length,
        missingVars: missingVars
      }
    };
    
    if (missingVars.length > 0) {
      healthCheck.status = 'unhealthy';
    }

    // Overall response time
    const totalResponseTime = Date.now() - startTime;
    
    return NextResponse.json({
      ...healthCheck,
      responseTime: totalResponseTime
    }, {
      status: healthCheck.status === 'healthy' ? 200 : 
             healthCheck.status === 'degraded' ? 207 : 503
    });

  } catch (error) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: String(error),
      responseTime: Date.now() - startTime
    }, { status: 503 });
  }
} 