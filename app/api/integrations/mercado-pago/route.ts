import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto-secrets';
import { requireTenantAdmin } from '@/lib/tenant';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    const { accessToken } = await req.json();
    if (typeof accessToken !== 'string' || !/^APP_USR-[\w-]{20,}$/.test(accessToken.trim()))
      return NextResponse.json({ ok: false, error: 'Access Token de produção inválido.' }, { status: 400 });
    await db.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'Mercado Pago' } },
      create: { tenantId, provider: 'Mercado Pago', status: 'CONNECTED', mode: 'DEV_MANUAL', accessTokenEncrypted: encryptSecret(accessToken.trim()), connectedAt: new Date(), config: { hidden: false } },
      update: { status: 'CONNECTED', accessTokenEncrypted: encryptSecret(accessToken.trim()), connectedAt: new Date(), disconnectedAt: null, lastError: null, metadata: {}, config: { hidden: false } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao conectar' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const tenantId = await requireTenantAdmin(req);
    await db.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'Mercado Pago' } },
      create: { tenantId, provider: 'Mercado Pago', status: 'DISCONNECTED', mode: 'DEV_MANUAL', config: { hidden: false } },
      update: { status: 'DISCONNECTED', accessTokenEncrypted: null, refreshTokenEncrypted: null, connectedAt: null, disconnectedAt: new Date(), lastError: null, metadata: {}, config: { hidden: false } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao desconectar' }, { status: 400 });
  }
}
