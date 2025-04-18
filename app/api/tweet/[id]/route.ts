import { fetchTweet } from 'react-tweet/api';
import { NextRequest, NextResponse } from 'next/server';

// In Next.js 15, params is now a Promise
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Need to await params since it's a Promise in Next.js 15
  const { id } = await params;

  try {
    const tweet = await fetchTweet(id);
    return NextResponse.json(tweet);
  } catch (error) {
    console.error('Error fetching tweet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tweet' },
      { status: 500 }
    );
  }
} 