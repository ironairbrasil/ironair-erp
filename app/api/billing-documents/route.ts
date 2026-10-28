import { NextResponse } from "next/server";
import { BillingDocumentType } from "@prisma/client";
import { db } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const cleanFileName = (name: string) => name.trim().replace(/(\.pdf)+$/i, ".pdf").replace(/(\.xml)+$/i, ".xml");

const publicDocument = (document: any) => ({
  id: document.id,
  orderId: document.orderId,
  type: document.type,
  fileName: cleanFileName(document.fileName),
  mimeType: document.mimeType,
  size: document.size,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  order: document.order
    ? {
        id: document.order.id,
        externalId: document.order.externalId,
        channel: document.order.channel,
        paidAt: document.order.paidAt,
        createdAt: document.order.createdAt,
        customer: document.order.customer ? { id: document.order.customer.id, name: document.order.customer.name } : null,
      }
    : undefined,
});

export async function GET(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const documents = await db.billingDocument.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        orderId: true,
        type: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            externalId: true,
            channel: true,
            paidAt: true,
            createdAt: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json({ ok: true, documents: documents.map(publicDocument) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Não foi possível carregar os documentos" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const form = await req.formData();
    const orderId = String(form.get("orderId") || "").trim();
    const type = String(form.get("type") || "").trim() as BillingDocumentType;
    const file = form.get("file");

    if (!orderId) return NextResponse.json({ ok: false, error: "Venda obrigatória" }, { status: 400 });
    if (!Object.values(BillingDocumentType).includes(type)) return NextResponse.json({ ok: false, error: "Tipo de documento inválido" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Selecione um arquivo" }, { status: 400 });
    if (!file.size) return NextResponse.json({ ok: false, error: "O arquivo está vazio" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ ok: false, error: "O arquivo deve ter no máximo 4 MB" }, { status: 400 });

    const extension = file.name.toLowerCase().split(".").pop() || "";
    const allowed = type === BillingDocumentType.SHIPPING_LABEL || type === BillingDocumentType.REFUNDED_LABEL || type === BillingDocumentType.INVOICE_PDF || type === BillingDocumentType.REFUNDED_DANFE ? ["pdf"] : type === BillingDocumentType.INVOICE_XML || type === BillingDocumentType.REFUNDED_XML ? ["xml"] : ["pdf", "xml"];
    if (!allowed.includes(extension)) {
      const error = type === BillingDocumentType.SHIPPING_LABEL || type === BillingDocumentType.REFUNDED_LABEL ? "A etiqueta deve ser um PDF" : type === BillingDocumentType.INVOICE_XML || type === BillingDocumentType.REFUNDED_XML ? "Selecione o XML da nota fiscal" : "O DANFE deve ser um PDF";
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    const order = await db.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true } });
    if (!order) return NextResponse.json({ ok: false, error: "Venda não encontrada" }, { status: 404 });

    const mimeType = extension === "xml" ? "application/xml" : "application/pdf";
    const data = Buffer.from(await file.arrayBuffer());
    const fileName = cleanFileName(file.name);
    const document = await db.billingDocument.upsert({
      where: { tenantId_orderId_type: { tenantId, orderId, type } },
      create: { tenantId, orderId, type, fileName, mimeType, size: file.size, data },
      update: { fileName, mimeType, size: file.size, data },
      select: { id: true, orderId: true, type: true, fileName: true, mimeType: true, size: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, document: publicDocument(document) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Não foi possível salvar o documento" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return NextResponse.json({ ok: false, error: "Selecione ao menos um documento" }, { status: 400 });
    const result = await db.billingDocument.deleteMany({ where: { tenantId, id: { in: ids } } });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Não foi possível excluir os documentos" }, { status: 400 });
  }
}
