import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";

const cleanFileName = (name: string) => name.trim().replace(/(\.pdf)+$/i, ".pdf").replace(/(\.xml)+$/i, ".xml");
const safeFileName = (name: string) => cleanFileName(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "_").replace(/[\r\n"\\/]/g, "_");

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getTenantId(req);
    const { id } = await context.params;
    const document = await db.billingDocument.findFirst({ where: { id, tenantId }, select: { fileName: true, mimeType: true, data: true } });
    if (!document) return NextResponse.json({ ok: false, error: "Documento não encontrado" }, { status: 404 });
    return new NextResponse(document.data, {
      headers: {
        "content-type": document.mimeType,
        "content-disposition": `attachment; filename="${safeFileName(document.fileName)}"; filename*=UTF-8''${encodeURIComponent(cleanFileName(document.fileName))}`,
        "content-length": String(document.data.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Não foi possível baixar o documento" }, { status: 400 });
  }
}
