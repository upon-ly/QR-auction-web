import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';

// Redis client for tracking state
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// QStash client for message scheduling
const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

// Queue a failed claim for retry
export async function queueFailedClaim(failureRecord: {
  id: string;
  fid: number;
  eth_address: string;
  auction_id?: string | number;
  username?: string | null;
  user_id?: string | null;
  winning_url?: string | null;
  option_type?: string;
  signer_uuid?: string;
  claim_source?: string;
}) {
  // Determine claim type
  let claimType: string;
  let endpointUrl: string;
  
  if (failureRecord.option_type) {
    // Likes/recasts claim
    claimType = 'likes-recasts';
    endpointUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-likes-recasts`;
  } else if (failureRecord.auction_id === '0' || failureRecord.auction_id === 0) {
    // Airdrop claim
    claimType = 'airdrop';
    endpointUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-airdrop`;
  } else {
    // Link-visit claim
    claimType = 'link-visit';
    endpointUrl = `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-claim`;
  }
  
  // Store latest retry info in Redis
  await redis.hset(`claim:${failureRecord.id}`, {
    status: 'queued',
    attempts: 0,
    type: claimType,
    lastQueued: new Date().toISOString(),
  });

  // Queue message with 5 minute delay for first retry
  const response = await qstash.publishJSON({
    url: endpointUrl,
    body: {
      failureId: failureRecord.id,
      attempt: 0,
    },
    delay: 5 * 60, // 5 minute delay in seconds
  });

  console.log(`Queued failed ${claimType} claim ${failureRecord.id} with message ID: ${response.messageId}`);
  
  return response.messageId;
}

// Get retry status for a failure
export async function getRetryStatus(failureId: string) {
  return redis.hgetall(`claim:${failureId}`);
}

// Update retry status
export async function updateRetryStatus(failureId: string, update: Record<string, string | number | boolean>) {
  return redis.hset(`claim:${failureId}`, update);
} 