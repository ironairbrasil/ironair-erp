import type { Attribution, TrackingEvent } from '@prisma/client';

export function resolveSessionOrigin(attribution: Attribution | null, events: TrackingEvent[], purchasedAt: Date): Attribution | null {
  if (!attribution?.sessionId) return attribution;
  const matching = events.filter(event => event.sessionId === attribution.sessionId
    && event.type !== 'PURCHASE' && event.occurredAt <= purchasedAt
    && !(event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) && event.metadata.manual === true))
    .sort((a, b) => +a.occurredAt - +b.occurredAt);
  if (!matching.length) return attribution;
  const first = matching.find(event => event.url);
  const last = matching[matching.length - 1];
  const snapshot = (event: TrackingEvent) => ({ utm_source: event.utmSource || 'Direto', utm_campaign: event.utmCampaign || '', landingPage: event.url || '', referrer: event.referrer || '' });
  // Explicit attribution, including manually assigned campaigns, takes priority.
  return { ...attribution,
    landingPage: attribution.landingPage || first?.url || null,
    referrer: attribution.referrer || first?.referrer || null,
    source: attribution.source || last.utmSource || 'Direto',
    medium: attribution.medium || last.utmMedium,
    campaign: attribution.campaign || last.utmCampaign,
    content: attribution.content || last.utmContent,
    term: attribution.term || last.utmTerm,
    campaignId: attribution.campaignId || last.campaignId,
    adsetId: attribution.adsetId || last.adsetId,
    adId: attribution.adId || last.adId,
    firstTouch: attribution.firstTouch || snapshot(matching[0]),
    lastTouch: attribution.lastTouch || snapshot(last),
  };
}
