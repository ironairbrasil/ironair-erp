import webpush from 'web-push';
import { db } from './db';

export async function sendTenantPush(tenantId: string, payload: { title: string; body: string; tag: string; url?: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { total: 0, sent: 0, expired: 0, failed: 0, configured: false };
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subscriptions = await db.pushSubscription.findMany({ where: { tenantId } });
  const results = await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify({ ...payload, url: payload.url || '/' }));
      return 'sent' as const;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.delete({ where: { id: row.id } });
        return 'expired' as const;
      }
      console.error('Push delivery failed', status || error);
      return 'failed' as const;
    }
  }));
  return {
    total: subscriptions.length,
    sent: results.filter(result => result === 'sent').length,
    expired: results.filter(result => result === 'expired').length,
    failed: results.filter(result => result === 'failed').length,
    configured: true
  };
}
