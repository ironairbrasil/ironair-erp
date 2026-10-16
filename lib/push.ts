import webpush from 'web-push';
import { db } from './db';

export async function sendTenantPush(tenantId: string, payload: { title: string; body: string; tag: string; url?: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subscriptions = await db.pushSubscription.findMany({ where: { tenantId } });
  await Promise.allSettled(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify({ ...payload, url: payload.url || '/' }));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: row.id } });
      else console.error('Push delivery failed', status || error);
    }
  }));
}
