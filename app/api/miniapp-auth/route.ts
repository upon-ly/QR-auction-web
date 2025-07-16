import { NextRequest, NextResponse } from 'next/server';
import { generateMiniAppToken } from '@/lib/miniapp-auth';
import { validateMiniAppUser } from '@/utils/miniapp-validation';
import { getClientIP } from '@/lib/ip-utils';

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);
  
  try {
    const { fid, address, username, clientFid } = await request.json();
    
    console.log(`🔐 Mini-app auth request: FID=${fid}, address=${address}, username=${username}, clientFid=${clientFid}, IP=${clientIP}`);
    
    if (!fid || !address) {
      return NextResponse.json({ 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }
    
    // Validate the FID exists and username matches
    const validation = await validateMiniAppUser(fid, username);
    if (!validation.isValid) {
      console.log(`❌ Mini-app auth failed validation: ${validation.error}`);
      return NextResponse.json({ 
        error: validation.error || 'Invalid user' 
      }, { status: 400 });
    }
    
    // Generate secure token
    const token = await generateMiniAppToken(fid, address, username, clientFid);
    
    console.log(`✅ Mini-app auth token generated for FID ${fid}`);
    
    return NextResponse.json({ 
      success: true,
      token,
      expiresIn: 300 // 5 minutes
    });
  } catch (error) {
    console.error('Error generating mini-app token:', error);
    return NextResponse.json({ 
      error: 'Failed to generate token' 
    }, { status: 500 });
  }
}