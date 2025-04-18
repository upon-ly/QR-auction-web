import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const type = request.nextUrl.searchParams.get('type') || null;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10');
    const onlyFeatured = request.nextUrl.searchParams.get('featured') === 'true';
    
    // Build query - no longer check if approved
    let query = supabase
      .from('testimonials')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
      
    // Apply filters
    if (type) {
      query = query.eq('type', type);
    }
    
    if (onlyFeatured) {
      query = query.eq('is_featured', true);
    }
    
    // Apply limit
    query = query.limit(limit);
    
    // Execute query
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching testimonials:', error);
      return NextResponse.json(
        { error: 'Failed to fetch testimonials' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ testimonials: data });
  } catch (error) {
    console.error('Unexpected error fetching testimonials:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 