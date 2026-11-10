import { describe, expect, it } from 'vitest';
import type { Attribution, TrackingEvent } from '@prisma/client';
import { resolveSessionOrigin } from './tracking-session-origin';
const attribution = (data = {}) => ({ sessionId: 'session-a', ...data }) as Attribution;
const event = (data = {}) => ({ sessionId: 'session-a', type: 'PAGE_VIEW', occurredAt: new Date('2026-11-08T12:00:00Z'), url: 'https://oferta.ironair.com.br/', ...data }) as TrackingEvent;
const paid = new Date('2026-11-09T14:00:00Z');

describe('session origin', () => {
  it('recovers the site and traffic source from a visit before the purchase period', () => {
    const result = resolveSessionOrigin(attribution(), [event({ utmSource: 'facebook', campaignId: 'campaign-1' })], paid)!;
    expect(result.landingPage).toBe('https://oferta.ironair.com.br/');
    expect(result.source).toBe('facebook');
    expect(result.campaignId).toBe('campaign-1');
  });
  it('recognizes direct traffic only when a matching session visit exists', () => {
    expect(resolveSessionOrigin(attribution(), [event()], paid)?.source).toBe('Direto');
    const original = attribution();
    expect(resolveSessionOrigin(original, [], paid)).toBe(original);
  });
  it('ignores another session, future visits, purchases and manual click adjustments', () => {
    const original = attribution();
    const events = [event({ sessionId: 'other' }), event({ occurredAt: new Date('2026-11-10') }), event({ type: 'PURCHASE' }), event({ type: 'INITIATE_CHECKOUT', metadata: { manual: true } })];
    expect(resolveSessionOrigin(original, events, paid)).toBe(original);
  });
  it('keeps explicit attribution and uses the earliest page across domains', () => {
    const result = resolveSessionOrigin(attribution({ source: 'google', medium: 'manual', campaignId: 'manual-campaign' }), [event({ url: 'https://pay.ironair.com.br/', occurredAt: new Date('2026-11-09T13:00:00Z') }), event()], paid)!;
    expect(result.landingPage).toBe('https://oferta.ironair.com.br/');
    expect(result.source).toBe('google');
    expect(result.campaignId).toBe('manual-campaign');
  });
});
