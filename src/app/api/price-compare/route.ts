import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceOffer = {
  id: string;
  title: string;
  seller: string;
  url: string;
  priceLabel: string;
  price: number | null;
  delivery?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUrl(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    // Quelques réponses peuvent omettre le protocole.
    if (/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sellerFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Vendeur";
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.SERPER_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Le comparateur n’est pas connecté : SERPER_API_KEY est absente." },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null) as
      | { query?: unknown; mode?: unknown }
      | null;

    const query = asText(body?.query);
    const mode = body?.mode === "subscription" ? "subscription" : "purchase";

    if (query.length < 2) {
      return NextResponse.json(
        { error: "Saisis au moins 2 caractères pour lancer la comparaison." },
        { status: 400 },
      );
    }

    // Shopping est privilégié pour les achats. Pour les abonnements,
    // une recherche web classique donne souvent de meilleurs résultats.
    const endpoint =
      mode === "subscription"
        ? "https://google.serper.dev/search"
        : "https://google.serper.dev/shopping";

    const serperResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "fr",
        hl: "fr",
        num: 10,
      }),
      cache: "no-store",
    });

    const rawText = await serperResponse.text();
    let data: any = null;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return NextResponse.json(
        { error: "Réponse inattendue du service de comparaison de prix." },
        { status: 502 },
      );
    }

    if (!serperResponse.ok) {
      const detail =
        asText(data?.message) ||
        asText(data?.error) ||
        `Erreur Serper (${serperResponse.status})`;

      return NextResponse.json({ error: detail }, { status: 502 });
    }

    const sourceRows: any[] =
      mode === "subscription"
        ? Array.isArray(data?.organic)
          ? data.organic
          : []
        : Array.isArray(data?.shopping)
          ? data.shopping
          : [];

    const items: PriceOffer[] = sourceRows
      .map((row: any, index: number): PriceOffer | null => {
        const url = normalizeUrl(row?.link ?? row?.url);
        if (!url) return null;

        const title =
          asText(row?.title) ||
          asText(row?.name) ||
          "Offre";

        const seller =
          asText(row?.source) ||
          asText(row?.seller) ||
          sellerFromUrl(url);

        const price =
          asNumber(row?.extractedPrice) ??
          asNumber(row?.price) ??
          asNumber(row?.priceValue);

        const priceLabel =
          asText(row?.price) ||
          (price !== null
            ? price.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })
            : "Voir le prix");

        return {
          id: `${index}-${url}`,
          title,
          seller,
          url,
          priceLabel,
          price,
          delivery: asText(row?.delivery) || null,
          rating:
            typeof row?.rating === "number" && Number.isFinite(row.rating)
              ? row.rating
              : null,
          ratingCount:
            typeof row?.ratingCount === "number" && Number.isFinite(row.ratingCount)
              ? row.ratingCount
              : null,
        };
      })
      .filter((item: PriceOffer | null): item is PriceOffer => item !== null)
      .sort((a, b) => {
        if (a.price === null && b.price === null) return 0;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      })
      .slice(0, 5);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[price-compare]", error);
    return NextResponse.json(
      { error: "Comparaison momentanément indisponible. Réessaie dans quelques instants." },
      { status: 500 },
    );
  }
}
