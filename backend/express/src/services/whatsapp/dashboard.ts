import { whatsappOutboundQueue } from './queue';

export async function getWhatsAppQueueHealth() {
  const [waiting, active, failed, delayed] = await Promise.all([
    whatsappOutboundQueue.getWaitingCount(),
    whatsappOutboundQueue.getActiveCount(),
    whatsappOutboundQueue.getFailedCount(),
    whatsappOutboundQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    failed,
    delayed,
    healthy: failed < 100 && active < 25,
    status: active > 0 ? 'processing' : waiting > 0 ? 'backlog' : 'idle',
  };
}
