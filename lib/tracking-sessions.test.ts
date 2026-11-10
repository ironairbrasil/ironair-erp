import { expect, it } from 'vitest';
import type { TrackingEvent } from '@prisma/client';
import { buildTrackingSessions } from './tracking-sessions';
const event = (data = {}) => ({ sessionId: 'session-1', visitorId: 'visitor-1', type: 'PAGE_VIEW', occurredAt: new Date('2026-11-09T12:00:00Z'), url: 'https://oferta.ironair.com.br/', ...data }) as TrackingEvent;
it('groups page views and clicks in one session and keeps the first landing page', () => {
  const sessions = buildTrackingSessions([event({ type: 'INITIATE_CHECKOUT', occurredAt: new Date('2026-11-09T12:01:00Z'), url: 'https://pay.ironair.com.br/' }), event()]);
  expect(sessions.size).toBe(1);
  expect(sessions.get('session-1')).toMatchObject({ pages: 1, buyClicks: 1, landingPage: 'https://oferta.ironair.com.br/' });
});
it('does not invent sessions for manual clicks or purchase-only records', () => {
  expect(buildTrackingSessions([event({ metadata: { manual: true }, type: 'INITIATE_CHECKOUT', sessionId: null, visitorId: null }), event({ type: 'PURCHASE' })]).size).toBe(0);
});
it('keeps different identified visitors even when timestamps and URLs match', () => {
  expect(buildTrackingSessions([event(), event({ sessionId: 'session-2', visitorId: 'visitor-2' })]).size).toBe(2);
});

it('excludes click-only sessions while retaining clicks attached to real visits', () => {
  const sessions = buildTrackingSessions([event(), event({ type: 'INITIATE_CHECKOUT' }), event({ sessionId: 'click-only', type: 'INITIATE_CHECKOUT' })]);
  expect(sessions.size).toBe(1);
  expect(sessions.get('session-1')?.buyClicks).toBe(1);
});
