import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const root = process.argv.find((argument) => argument.startsWith("--root="))?.slice(7);
const apply = process.argv.includes("--apply");
if (!root) throw new Error("Informe --root=/caminho/ETIQUETAS");

const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cleanFileName = (name) => name.trim().replace(/(\.pdf)+$/i, ".pdf").replace(/(\.xml)+$/i, ".xml");
const channelMap = { "SHOPIFY": "SHOPIFY", "MERCADO LIVRE": "MERCADO_LIVRE", "AMAZON": "AMAZON" };
const monthMap = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, "MARÇO": 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };
const tokenScore = (left, right) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 6 ? 88 : 55;
  const aa = new Set(a.split(" ").filter((token) => token.length > 1));
  const bb = new Set(b.split(" ").filter((token) => token.length > 1));
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  return Math.round((intersection / Math.max(aa.size, bb.size, 1)) * 100);
};
const isRefundXml = (file) => /<natOp>[^<]*devolu|<finNFe>4<\/finNFe>|<tpNF>0<\/tpNF>/i.test(fs.readFileSync(file, "utf8"));
const xmlKey = (file) => fs.readFileSync(file, "utf8").match(/<infNFe\s+Id="NFe(\d{44})"/i)?.[1] || "";
const documentType = (file, orderStatus, refundKeys) => {
  const fileName = path.basename(file);
  if (/\.xml$/i.test(fileName)) return isRefundXml(file) ? "REFUNDED_XML" : "INVOICE_XML";
  const fileKey = fileName.match(/(\d{44})/)?.[1] || "";
  if (/danfe/i.test(fileName) || /^\d{30,}.*\.pdf$/i.test(fileName)) return fileKey && refundKeys.has(fileKey) ? "REFUNDED_DANFE" : "INVOICE_PDF";
  return "SHIPPING_LABEL";
};
const mimeType = (fileName) => /\.xml$/i.test(fileName) ? "application/xml" : "application/pdf";

const files = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(pdf|xml)$/i.test(entry.name) && !entry.name.startsWith("~$"))
  .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
const tenants = await db.tenant.findMany({ select: { id: true, name: true } });
if (tenants.length !== 1) throw new Error(`Esperado 1 tenant, encontrados ${tenants.length}`);
const tenantId = tenants[0].id;
const orders = await db.order.findMany({
  where: { tenantId },
  select: { id: true, externalId: true, channel: true, status: true, paidAt: true, createdAt: true, customer: { select: { name: true } } },
});

const groups = new Map();
for (const file of files) {
  const relative = path.relative(root, file);
  const parts = relative.split(path.sep);
  if (parts.length < 4) continue;
  const [channelFolder, monthFolder, customerFolder] = parts;
  const channel = channelMap[channelFolder.toUpperCase()];
  const monthName = normalize(monthFolder.split(".").slice(1).join(".")).toUpperCase();
  const month = monthMap[monthName];
  if (!channel || !month) continue;
  const key = [channel, month, customerFolder].join("|");
  if (!groups.has(key)) groups.set(key, { channel, month, customerFolder, files: [] });
  groups.get(key).files.push(file);
}

const matches = [];
const ambiguous = [];
for (const group of groups.values()) {
  const candidates = orders
    .filter((order) => order.channel === group.channel && new Date(order.paidAt || order.createdAt).getMonth() + 1 === group.month)
    .map((order) => ({ order, score: tokenScore(group.customerFolder, order.customer?.name || "") }))
    .filter((candidate) => candidate.score >= 58)
    .sort((a, b) => b.score - a.score);
  const uniqueOrders = [...new Set(candidates.filter((candidate) => candidate.score === candidates[0]?.score).map((candidate) => candidate.order.id))];
  if (!candidates.length || uniqueOrders.length !== 1 || (candidates[1] && candidates[0].score - candidates[1].score < 12 && candidates[0].order.id !== candidates[1].order.id)) {
    ambiguous.push({ customer: group.customerFolder, channel: group.channel, month: group.month, files: group.files.length, candidates: candidates.slice(0, 3).map(({ order, score }) => ({ id: order.externalId, customer: order.customer?.name, score })) });
    continue;
  }
  matches.push({ ...group, order: candidates[0].order, score: candidates[0].score });
}

let imported = 0;
let skippedDuplicateType = 0;
if (apply) {
  const legacyRefundedLabels = await db.billingDocument.findMany({ where: { tenantId, type: "REFUNDED_LABEL" } });
  for (const document of legacyRefundedLabels) {
    const existingLabel = await db.billingDocument.findUnique({ where: { tenantId_orderId_type: { tenantId, orderId: document.orderId, type: "SHIPPING_LABEL" } } });
    if (existingLabel) await db.billingDocument.delete({ where: { id: document.id } });
    else await db.billingDocument.update({ where: { id: document.id }, data: { type: "SHIPPING_LABEL" } });
  }
  for (const match of matches) {
    const byType = new Map();
    const refundKeys = new Set(match.files.filter((file) => /\.xml$/i.test(file) && isRefundXml(file)).map(xmlKey).filter(Boolean));
    for (const file of match.files) {
      const type = documentType(file, match.order.status, refundKeys);
      if (byType.has(type)) { skippedDuplicateType += 1; continue; }
      byType.set(type, file);
    }
    for (const [type, file] of byType) {
      const data = fs.readFileSync(file);
      const fileName = cleanFileName(path.basename(file));
      await db.billingDocument.upsert({
        where: { tenantId_orderId_type: { tenantId, orderId: match.order.id, type } },
        create: { tenantId, orderId: match.order.id, type, fileName, mimeType: mimeType(fileName), size: data.byteLength, data },
        update: { fileName, mimeType: mimeType(fileName), size: data.byteLength, data },
      });
      imported += 1;
    }
  }
}

console.log(JSON.stringify({ tenant: tenants[0].name, totalFiles: files.length, matchedFolders: matches.length, matchedFiles: matches.reduce((sum, match) => sum + match.files.length, 0), ambiguousFolders: ambiguous.length, imported, skippedDuplicateType, matches: matches.map((match) => ({ customer: match.customerFolder, order: match.order.externalId, orderCustomer: match.order.customer?.name, channel: match.channel, status: match.order.status, score: match.score, files: match.files.map((file) => path.basename(file)) })), ambiguous }, null, 2));
await db.$disconnect();
