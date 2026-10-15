import { NextResponse } from 'next/server';
import { syncConnectedMetaTenants } from '@/lib/meta-ads';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const results = await syncConnectedMetaTenants(3);
  return NextResponse.json({ ok: results.every(result => result.ok), results });
}
