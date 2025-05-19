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
  auction_id: string | number;
  username?: string | null;
  winning_url?: string | null;
}) {
  // Store latest retry info in Redis
  await redis.hset(`claim:${failureRecord.id}`, {
    status: 'queued',
    attempts: 0,
    lastQueued: new Date().toISOString(),
  });

  // Queue message with 10 minute delay for first retry
  const response = await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-claim`,
    body: {
      failureId: failureRecord.id,
      attempt: 0,
    },
    delay: 10 * 60, // 10 minute delay in seconds
  });

  console.log(`Queued failed claim ${failureRecord.id} with message ID: ${response.messageId}`);
  
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