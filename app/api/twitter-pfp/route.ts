import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  
  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  // Just return the unavatar.io URL - let the client handle caching
  const profileImageUrl = `https://unavatar.io/x/${username}`;
  
  return NextResponse.json({ profile_image_url: profileImageUrl });
} 