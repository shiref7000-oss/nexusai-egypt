import { Queue } from 'bullmq';
import { redis } from '../queue';
import type { WhatsAppOutboundJob } from './sendService';

export const whatsappOutboundQueue = new Queue('whatsapp-outbound', {
  connection: redis,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 8000 },
    removeOnComplete: { age: 3600 * 48, count: 2000 },
    removeOnFail: { age: 3600 * 72, count: 500 },
  },
});

export async function addWhatsAppOutboundJob(
  data: WhatsAppOutboundJob,
  opts?: { delayMs?: number }
) {
  const jobId = `wa-${data.userId}-${data.orderId || 'test'}-${Date.now()}`;
  return whatsappOutboundQueue.add(jobId, data, {
    jobId,
    priority: data.orderId ? 2 : 5,
    delay: opts?.delayMs && opts.delayMs > 0 ? opts.delayMs : undefined,
  });
}
