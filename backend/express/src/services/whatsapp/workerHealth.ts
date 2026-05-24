import axios from 'axios';
import { env } from '../../config/env';
import { redis } from '../queue';

export async function getWorkerRuntimeStatus(): Promise<{
  redisReady: boolean;
  workerReachable: boolean;
  workerRole: string;
  note: string;
}> {
  const redisReady = redis.status === 'ready';
  let workerReachable = false;
  try {
    const { data } = await axios.get(`http://127.0.0.1:${env.WORKER_HEALTH_PORT}/health`, {
      timeout: 2500,
    });
    workerReachable = data?.success === true && data?.role === 'worker';
  } catch {
    workerReachable = false;
  }

  return {
    redisReady,
    workerReachable,
    workerRole: 'nexusai-worker',
    note: workerReachable
      ? 'Outbound WhatsApp jobs run in nexusai-worker (API has RUN_WORKERS=false by design).'
      : 'Start nexusai-worker PM2 process to send WhatsApp messages.',
  };
}
