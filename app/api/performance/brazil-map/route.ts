import { NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";

export async function GET(req: Request) {
  await getTenantId(req);
  const response = await fetch("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF", { next: { revalidate: 604800 } });
  if (!response.ok) return NextResponse.json({ type: "FeatureCollection", features: [] }, { status: 502 });
  return NextResponse.json(await response.json(), { headers: { "Cache-Control": "private, max-age=86400" } });
}
