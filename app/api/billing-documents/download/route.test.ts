import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

const { findMany, getTenantId } = vi.hoisted(() => ({ findMany: vi.fn(), getTenantId: vi.fn() }));
vi.mock('../../../../lib/db', () => ({ db: { billingDocument: { findMany } } }));
vi.mock('../../../../lib/tenant', () => ({ getTenantId }));
import { POST } from './route';

const request = (ids: string[], mode = 'invoices') => new Request('http://localhost/api/billing-documents/download', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, mode }),
});
beforeEach(() => { vi.resetAllMocks(); getTenantId.mockResolvedValue('tenant-a'); });

describe('billing document ZIP downloads', () => {
  it('archives only the requested IDs for the active tenant, preserving duplicate filenames and contents', async () => {
    findMany.mockResolvedValue([
      { id: 'one', fileName: 'nota.xml', order: { channel: 'SHOPIFY' }, data: Buffer.from('<nota>1</nota>') },
      { id: 'two', fileName: 'nota.xml', order: { channel: 'SHOPIFY' }, data: Buffer.from('<nota>2</nota>') },
      { id: 'three', fileName: '../nota.xml', order: { channel: 'SHOPIFY' }, data: Buffer.from('<nota>3</nota>') },
    ]);
    const response = await POST(request(['one', 'two', 'three', 'one']));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-a', id: { in: ['one', 'two', 'three'] }, type: { notIn: ['SHIPPING_LABEL', 'REFUNDED_LABEL'] } });
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files)).toHaveLength(3);
    expect(strFromU8(files['Shopify/nota.xml'])).toBe('<nota>1</nota>');
    expect(strFromU8(files['Shopify/nota (2).xml'])).toBe('<nota>2</nota>');
    expect(Object.keys(files).every(name => name.split('/').length === 2 && !name.includes('..') && !name.includes('\\'))).toBe(true);
  });
  it('restricts label downloads to shipping labels and refunded labels', async () => {
    findMany.mockResolvedValue([{ id: 'label', fileName: 'etiqueta.pdf', order: { channel: 'AMAZON' }, data: Buffer.from('%PDF-test') }]);
    const response = await POST(request(['label'], 'labels'));
    expect(response.status).toBe(200);
    expect(findMany.mock.calls[0][0].where.type).toEqual({ in: ['SHIPPING_LABEL', 'REFUNDED_LABEL'] });
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(strFromU8(files['Amazon/etiqueta.pdf'])).toBe('%PDF-test');
  });
  it('groups mixed origins without renaming identical filenames across different folders', async () => {
    findMany.mockResolvedValue([
      { id: 'ml', fileName: 'nota.xml', order: { channel: 'MERCADO_LIVRE' }, data: Buffer.from('ML') },
      { id: 'amazon', fileName: 'nota.xml', order: { channel: 'AMAZON' }, data: Buffer.from('AMZ') },
      { id: 'shopify', fileName: 'nota.xml', order: { channel: 'SHOPIFY' }, data: Buffer.from('SHOP') },
      { id: 'manual', fileName: 'nota.xml', order: { channel: 'MANUAL' }, data: Buffer.from('MANUAL') },
    ]);
    const response = await POST(request(['ml', 'amazon', 'shopify', 'manual']));
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['Amazon/nota.xml', 'Mercado Livre/nota.xml', 'Shopify/nota.xml', 'Vendas manuais/nota.xml']);
    expect(strFromU8(files['Mercado Livre/nota.xml'])).toBe('ML');
    expect(strFromU8(files['Amazon/nota.xml'])).toBe('AMZ');
    expect(strFromU8(files['Shopify/nota.xml'])).toBe('SHOP');
  });
  it('fails the complete download when a selected document is missing or outside the tenant', async () => {
    findMany.mockResolvedValue([]);
    expect((await POST(request(['foreign']))).status).toBe(404);
  });
  it('rejects empty selections and unauthenticated requests before reading documents', async () => {
    expect((await POST(request([]))).status).toBe(400);
    getTenantId.mockRejectedValue(new Error('unauthorized'));
    expect((await POST(request(['one']))).status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
});
