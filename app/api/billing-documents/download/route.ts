import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { db } from "../../../../lib/db";
import { getTenantId } from "../../../../lib/tenant";

export const runtime = "nodejs";

const originFolders: Record<string, string> = {
  MERCADO_LIVRE: "Mercado Livre",
  AMAZON: "Amazon",
  SHOPIFY: "Shopify",
  MANUAL: "Vendas manuais",
  SHOPEE: "Shopee",
  PAYMENTS: "Pagamentos",
};

export async function POST(req: Request) {
  try {
    const tenantId = await getTenantId(req);
    const body = await req.json();
    const ids = Array.isArray(body.ids)
      ? [...new Set<string>(body.ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : [];
    if (!ids.length) return NextResponse.json({ ok: false, error: "Selecione ao menos um documento" }, { status: 400 });
    if (body.mode !== "labels" && body.mode !== "invoices") return NextResponse.json({ ok: false, error: "Tipo de download inválido" }, { status: 400 });
    const labels = ["SHIPPING_LABEL", "REFUNDED_LABEL"] as const;
    const documents = await db.billingDocument.findMany({
      where: { tenantId, id: { in: ids }, type: body.mode === "labels" ? { in: [...labels] } : { notIn: [...labels] } },
      select: { id: true, fileName: true, data: true, order: { select: { channel: true } } },
    });
    if (documents.length !== ids.length) return NextResponse.json({ ok: false, error: "Um ou mais documentos não estão disponíveis. Atualize a lista e selecione novamente." }, { status: 404 });

    const files: Record<string, Uint8Array> = Object.create(null);
    const usedNames = new Set<string>();
    for (const document of documents) {
      const folder = originFolders[document.order.channel] || "Outras origens";
      const original = document.fileName.trim().replace(/[\x00-\x1f\x7f/\\:]/g, "_").replace(/^\.+/, "_") || "documento";
      const extensionIndex = original.lastIndexOf(".");
      const stem = extensionIndex > 0 ? original.slice(0, extensionIndex) : original;
      const extension = extensionIndex > 0 ? original.slice(extensionIndex) : "";
      let name = original;
      let suffix = 2;
      while (usedNames.has(`${folder}/${name}`.toLocaleLowerCase("pt-BR"))) name = `${stem} (${suffix++})${extension}`;
      usedNames.add(`${folder}/${name}`.toLocaleLowerCase("pt-BR"));
      files[`${folder}/${name}`] = document.data;
    }
    const archive = zipSync(files, { level: 0 });
    const name = body.mode === "labels" ? "etiquetas" : "notas-fiscais";
    return new NextResponse(Buffer.from(archive), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${name}.zip"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Não foi possível preparar o ZIP" }, { status: 400 });
  }
}
