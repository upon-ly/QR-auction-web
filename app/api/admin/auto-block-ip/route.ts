import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addIPToVercelFirewall } from '../../../../lib/vercel-firewall';

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Thresholds for auto-blocking
const VALIDATION_ERROR_THRESHOLD = 5; // Block after 5 validation errors
const TIME_WINDOW_MINUTES = 60; // Within 60 minutes

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ip, reason = 'Validation errors' } = await request.json();
    
    if (!ip) {
      return NextResponse.json({ error: 'IP address required' }, { status: 400 });
    }

    console.log(`🔍 Checking if IP ${ip} should be auto-blocked...`);

    // Check recent validation errors for this IP
    const timeThreshold = new Date(Date.now() - TIME_WINDOW_MINUTES * 60 * 1000).toISOString();
    
    // Count validation errors from all claim endpoints
    const { data: airdropErrors, error: airdropError } = await supabase
      .from('airdrop_claim_failures')
      .select('id')
      .eq('client_ip', ip)
      .in('error_code', ['VALIDATION_ERROR', 'INVALID_USER', 'ADDRESS_NOT_VERIFIED'])
      .gte('created_at', timeThreshold);

    const { data: linkVisitErrors, error: linkVisitError } = await supabase
      .from('link_visit_claim_failures')
      .select('id')
      .eq('client_ip', ip)
      .in('error_code', ['VALIDATION_ERROR', 'INVALID_USER', 'ADDRESS_NOT_VERIFIED'])
      .gte('created_at', timeThreshold);

    const { data: likesRecastsErrors, error: likesRecastsError } = await supabase
      .from('likes_recasts_claim_failures')
      .select('id')
      .eq('client_ip', ip)
      .in('error_code', ['VALIDATION_ERROR', 'INVALID_USER', 'ADDRESS_NOT_VERIFIED'])
      .gte('created_at', timeThreshold);

    if (airdropError || linkVisitError || likesRecastsError) {
      console.error('Error checking validation errors:', { airdropError, linkVisitError, likesRecastsError });
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check validation errors' 
      }, { status: 500 });
    }

    const totalErrors = (airdropErrors?.length || 0) + 
                       (linkVisitErrors?.length || 0) + 
                       (likesRecastsErrors?.length || 0);

    console.log(`IP ${ip} has ${totalErrors} validation errors in the last ${TIME_WINDOW_MINUTES} minutes`);

    if (totalErrors >= VALIDATION_ERROR_THRESHOLD) {
      console.log(`🚫 IP ${ip} exceeded threshold (${totalErrors}/${VALIDATION_ERROR_THRESHOLD}), adding to Vercel Firewall...`);
      
      // Add to Vercel Firewall
      const firewallResult = await addIPToVercelFirewall(
        ip, 
        `Auto-blocked: ${totalErrors} validation errors in ${TIME_WINDOW_MINUTES}min - ${reason}`
      );

      if (firewallResult.success) {
        // Log the auto-block action
        await supabase
          .from('auto_blocked_ips')
          .insert({
            ip_address: ip,
            reason: `${totalErrors} validation errors`,
            error_count: totalErrors,
            time_window_minutes: TIME_WINDOW_MINUTES,
            blocked_via: 'vercel_firewall',
            created_at: new Date().toISOString()
          });

        // Clean up validation error records for this IP to save database space
        console.log(`🧹 Cleaning up validation error records for blocked IP ${ip}...`);
        
        const cleanupPromises = [
          supabase
            .from('airdrop_claim_failures')
            .delete()
            .eq('client_ip', ip)
            .in('error_code', ['VALIDATION_ERROR', 'INVALID_USER', 'ADDRESS_NOT_VERIFIED']),
          
          supabase
            .from('link_visit_claim_failures')
            .delete()
            .eq('client_ip', ip)
            .in('error_code', ['VALIDATION_ERROR', 'INVALID_USER', 'ADDRESS_NOT_VERIFIED']),
          
          supabase
            .from('likes_recasts_claim_failures')
            .delete()
            .eq('client_ip', ip)
            .in('error_code', ['VALIDATION_ERROR', 'INVALID_USER', 'ADDRESS_NOT_VERIFIED'])
        ];

        const cleanupResults = await Promise.allSettled(cleanupPromises);
        
        // Log cleanup results
        cleanupResults.forEach((result, index) => {
          const tableName = ['airdrop_claim_failures', 'link_visit_claim_failures', 'likes_recasts_claim_failures'][index];
          if (result.status === 'fulfilled') {
            console.log(`✅ Cleaned up validation errors from ${tableName} for IP ${ip}`);
          } else {
            console.error(`❌ Failed to clean up ${tableName} for IP ${ip}:`, result.reason);
          }
        });

        console.log(`🧹 Cleanup complete for IP ${ip} - removed validation error records to save database space`);

        return NextResponse.json({ 
          success: true, 
          message: `IP ${ip} auto-blocked in Vercel Firewall and validation errors cleaned up`,
          error_count: totalErrors,
          threshold: VALIDATION_ERROR_THRESHOLD,
          cleanup_completed: true
        });
      } else {
        console.error(`Failed to add IP ${ip} to Vercel Firewall:`, firewallResult.error);
        return NextResponse.json({ 
          success: false, 
          error: `Failed to add to Vercel Firewall: ${firewallResult.error}`,
          error_count: totalErrors
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({ 
        success: false, 
        message: `IP ${ip} below threshold`,
        error_count: totalErrors,
        threshold: VALIDATION_ERROR_THRESHOLD,
        remaining: VALIDATION_ERROR_THRESHOLD - totalErrors
      });
    }

  } catch (error) {
    console.error('Auto-block IP error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process auto-block request' 
    }, { status: 500 });
  }
} 