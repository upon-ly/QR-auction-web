import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey
);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";
const NEYNAR_API_URL = "https://api.neynar.com/v2";

// Type definitions
interface Signer {
  fid: number;
  signer_uuid: string;
  permissions: string[];
  status: string;
  follower_count?: number;
}
interface BatchState {
  castHash: string;
  actionType: string;
  targetFid?: number;
  signers: Signer[];
  currentIndex: number;
  results: {
    successful: number;
    failed: number;
    errors: string[];
    details: Array<{
      fid: number;
      action: string;
      success: boolean;
      error?: string;
    }>;
  };
}

// Helper function to sleep
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to process a single signer (like/recast/follow)
async function processSigner(signer: Signer, state: BatchState) {
  const { castHash, actionType, results } = state;
  // Like
  if (
    signer.permissions.includes("like") &&
    (actionType === "likes" || actionType === "both" || actionType === "all")
  ) {
    try {
      console.log("like---------", signer);
      const likeResponse = await fetch(`${NEYNAR_API_URL}/farcaster/reaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: NEYNAR_API_KEY,
        },
        body: JSON.stringify({
          signer_uuid: signer.signer_uuid,
          reaction_type: "like",
          target: castHash,
        }),
      });
      if (!likeResponse.ok) {
        const error = await likeResponse.json();
        results.errors.push(
          `Like failed for FID ${signer.fid}: ${
            error.message || "Unknown error"
          }`
        );
        results.details.push({
          fid: signer.fid,
          action: "like",
          success: false,
          error: error.message || "Unknown error",
        });
        results.failed++;
      } else {
        results.details.push({
          fid: signer.fid,
          action: "like",
          success: true,
        });
        results.successful++;
      }
    } catch (likeError) {
      results.errors.push(`Like error for FID ${signer.fid}: ${likeError}`);
      results.details.push({
        fid: signer.fid,
        action: "like",
        success: false,
        error: String(likeError),
      });
      results.failed++;
    }
  } else if (
    actionType === "likes" ||
    actionType === "both" ||
    actionType === "all"
  ) {
    results.details.push({
      fid: signer.fid,
      action: "like",
      success: false,
      error: "No like permission",
    });
    results.failed++;
  }
  // Recast
  if (
    signer.permissions.includes("recast") &&
    (actionType === "both" || actionType === "all")
  ) {
    try {
      console.log("recast---------", signer);
      const recastResponse = await fetch(
        `${NEYNAR_API_URL}/farcaster/reaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            api_key: NEYNAR_API_KEY,
          },
          body: JSON.stringify({
            signer_uuid: signer.signer_uuid,
            reaction_type: "recast",
            target: castHash,
          }),
        }
      );
      if (!recastResponse.ok) {
        const error = await recastResponse.json();
        results.errors.push(
          `Recast failed for FID ${signer.fid}: ${
            error.message || "Unknown error"
          }`
        );
        results.details.push({
          fid: signer.fid,
          action: "recast",
          success: false,
          error: error.message || "Unknown error",
        });
        results.failed++;
      } else {
        results.details.push({
          fid: signer.fid,
          action: "recast",
          success: true,
        });
        results.successful++;
      }
    } catch (recastError) {
      results.errors.push(`Recast error for FID ${signer.fid}: ${recastError}`);
      results.details.push({
        fid: signer.fid,
        action: "recast",
        success: false,
        error: String(recastError),
      });
      results.failed++;
    }
  } else if (actionType === "both" || actionType === "all") {
    results.details.push({
      fid: signer.fid,
      action: "recast",
      success: false,
      error: "No recast permission",
    });
    results.failed++;
  }
}

// The cron job handler
export async function GET() {
  // Process all batches (support multiple in parallel)
  const keys: string[] = await redis.keys("likes-recasts-batch:*");
  if (keys.length === 0) {
    return NextResponse.json({ message: "No batch in progress" });
  }
  const responses: Array<{ batchKey: string; message: string; results?: BatchState['results'] }> =
    [];
  for (const batchKey of keys as string[]) {
    const state: BatchState | null = await redis.get(batchKey);
    if (!state) {
      responses.push({ batchKey, message: "Batch state missing" });
      continue;
    }

    const { signers, currentIndex } = state;
    const BATCH_SIZE = 5;
    const toProcess = signers.slice(currentIndex, currentIndex + BATCH_SIZE);
    for (let i = 0; i < toProcess.length; i++) {
      await processSigner(toProcess[i], state);
      if (i < toProcess.length - 1) {
        await sleep(1000);
      }
    }
    state.currentIndex += toProcess.length;
    await redis.set(batchKey, JSON.stringify(state));
    if (state.currentIndex >= signers.length) {
      // Log results to DB before cleanup
      await supabase.from("auto_engagement_logs").insert({
        cast_hash: state.castHash,
        cast_url: `https://warpcast.com/~/conversations/${state.castHash}`,
        total_signers: state.signers.length,
        successful: state.results.successful,
        failed: state.results.failed,
        errors: state.results.errors.length > 0 ? state.results.errors : null,
        processed_at: new Date().toISOString(),
      });
      await redis.del(batchKey);
      responses.push({
        batchKey,
        message: "Batch complete",
        results: state.results,
      });
    } else {
      responses.push({
        batchKey,
        message: `Processed ${state.currentIndex}/${signers.length}`,
        results: state.results,
      });
    }
  }
  return NextResponse.json(responses);
}
