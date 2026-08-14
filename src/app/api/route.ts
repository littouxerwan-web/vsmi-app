import { NextRequest, NextResponse } from "next/server";

type SerperShoppingItem = { title?: string; source?: string; link?: string; price?: string; delivery?: string; rating?: number; ratingCount?: number; imageUrl?: string };

function priceNumber(value?: string) {
  if (!value) return null;
  const cleaned = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "").replace(",", ".");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ configured: false, error: "Le comparateur n’est pas encore connecté à une source de prix. Ajoute SERPER_API_KEY dans les variables d’environnement Vercel." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const query = String(body?.query ?? "").trim();
  const mode = body?.mode === "subscription" ? "subscription" : "purchase";
  if (query.length < 2) return NextResponse.json({ configured: true, error: "Indique un produit ou un abonnement à comparer." }, { status: 400 });
  const q = mode === "subscription" ? `${query} abonnement prix France` : `${query} prix acheter France`;
  try {
    const response = await fetch("https://google.serper.dev/shopping", { method: "POST", headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ q, gl: "fr", hl: "fr", num: 10 }), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ configured: true, error: `Source de prix indisponible (${response.status}).` }, { status: 502 });
    const data = await response.json();
    const items = ((data?.shopping ?? []) as SerperShoppingItem[]).map((item, index) => ({ id: `${index}-${item.source ?? "offre"}`, title: item.title ?? query, seller: item.source ?? "Vendeur", url: item.link ?? "", priceLabel: item.price ?? "Prix non indiqué", price: priceNumber(item.price), delivery: item.delivery ?? null, rating: item.rating ?? null, ratingCount: item.ratingCount ?? null })).filter(item => item.url).sort((a,b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER)).slice(0,5);
    return NextResponse.json({ configured: true, query, mode, checkedAt: new Date().toISOString(), items });
  } catch {
    return NextResponse.json({ configured: true, error: "Impossible de contacter la source de prix pour le moment." }, { status: 502 });
  }
}
