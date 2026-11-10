import type { TrackingEvent } from '@prisma/client';

type Session = { id: string; visitorId: string | null; startedAt: Date; lastAt: Date; pages: number; buyClicks: number; source: string; campaign: string; landingPage: string };
export function buildTrackingSessions(events: TrackingEvent[]) {
  const sessions = new Map<string, Session>();
  const visited = new Set<string>();
  for (const event of [...events].sort((a, b) => +a.occurredAt - +b.occurredAt)) {
    const manual = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) && event.metadata.manual === true;
    if (manual || event.type === 'PURCHASE') continue;
    const id = event.sessionId || event.visitorId;
    if (!id) continue;
    if (event.type === 'PAGE_VIEW' || event.type === 'VIEW_CONTENT') visited.add(id);
    const row = sessions.get(id) || { id, visitorId: event.visitorId, startedAt: event.occurredAt, lastAt: event.occurredAt, pages: 0, buyClicks: 0, source: event.utmSource || 'Direto', campaign: event.utmCampaign || event.utmContent || event.campaignId || '—', landingPage: event.url || '—' };
    row.lastAt = event.occurredAt;
    if (event.type === 'PAGE_VIEW') row.pages++;
    if (event.type === 'INITIATE_CHECKOUT') row.buyClicks++;
    sessions.set(id, row);
  }
  return new Map([...sessions].filter(([id]) => visited.has(id)));
}
