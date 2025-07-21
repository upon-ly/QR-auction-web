import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey
);

if (!supabaseServiceKey) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database reads may fail due to RLS"
  );
}

import { isAdminAddress } from "@/lib/constants";

interface NeynarUser {
  fid: number;
  follower_count?: number;
  following_count?: number;
  experimental?: {
    neynar_user_score?: number;
  };
  power_badge?: boolean;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  bio?: string;
  profile?: {
    bio?: {
      text?: string;
    };
  };
  verified_accounts?: Array<{
    platform: string;
    username: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization");
    const address = authHeader?.replace("Bearer ", "");

    if (!address || !isAdminAddress(address)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all approved signers' fids from Supabase
    const { data: signers, error } = await supabase
      .from("neynar_signers_updated")
      .select(
        `
        fid, 
        permissions, 
        status, 
        approved_at, 
        username,
        display_name,
        follower_count,
        following_count,
        neynar_score,
        power_badge,
        pfp_url,
        bio,
        verified_accounts,
        last_updated_at
      `
      )
      .eq("status", "approved")
      .limit(10000)
      .order("follower_count", { ascending: false });

    if (error) {
      console.error("Error fetching signers:", error);
      return NextResponse.json(
        { error: "Failed to fetch signers" },
        { status: 500 }
      );
    }

    // Only use the fids for the Neynar API
    const fids = (signers || []).map((s: { fid: number }) => s.fid);
    if (!fids.length) {
      return NextResponse.json(
        { error: "No approved signers found" },
        { status: 404 }
      );
    }

    // Helper to split array into chunks
    function chunkArray(array: number[], size: number) {
      const result = [];
      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
      }
      return result;
    }

    const fidChunks = chunkArray(fids, 100);
    const allResults: NeynarUser[] = [];
    for (const chunk of fidChunks) {
      // Convert chunk to comma-separated string
      const fidsString = chunk.join(",");
      const options = {
        method: "GET",
        headers: {
          "x-api-key": NEYNAR_API_KEY,
          "x-neynar-experimental": "false",
        },
      };
      const neynarRes = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk/?fids=${fidsString}`,
        options
      );
      const neynarData = await neynarRes.json();
      if (Array.isArray(neynarData.users)) {
        allResults.push(...neynarData.users);
      }
    }

    // Only keep fid, follower_count, following_count, neynar_score
    const filteredResults = allResults.map((user: NeynarUser) => ({
      fid: user.fid,
      follower_count: user.follower_count,
      following_count: user.following_count,
      neynar_score: user.experimental?.neynar_user_score,
    }));

    // Update Supabase for each user
    let updatedCount = 0;
    for (const user of filteredResults) {
      const { fid, follower_count, following_count, neynar_score } = user;
      const { error: updateError } = await supabase
        .from("neynar_signers_updated")
        .update({
          follower_count,
          following_count,
          neynar_score,
        })
        .eq("fid", fid);
      if (!updateError) {
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      signers: filteredResults,
      count: filteredResults.length,
      updated: updatedCount,
    });
  } catch (error) {
    console.error("Error in update-users API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
