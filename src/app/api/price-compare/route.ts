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
  relevance: number;
};

const ACCESSORY_WORDS = [
  "accessoire",
  "accessoires",
  "batterie",
  "battery",
  "chargeur",
  "charger",
  "capuchon",
  "bouchon",
  "lens cap",
  "pare soleil",
  "pare-soleil",
  "hood",
  "grip",
  "thumb grip",
  "poignee",
  "poignée",
  "etui",
  "étui",
  "case",
  "housse",
  "protection",
  "coque",
  "filtre",
  "filter",
  "cpl",
  "mist",
  "sangle",
  "strap",
  "adaptateur",
  "adapter",
  "cable",
  "câble",
  "support",
  "mount",
  "cage",
  "verre trempe",
  "verre trempé",
  "screen protector",
];

const ACCESSORY_SIGNALS = [
  "pour ",
  "compatible ",
  "remplacement ",
  "replacement ",
  "fits ",
  "destiné à ",
  "destine a ",
];

const STOP_WORDS = new Set([
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "un",
  "une",
  "et",
  "pour",
  "avec",
  "the",
  "for",
  "with",
]);

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

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeUrl(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
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

function queryLooksLikeAccessory(query: string): boolean {
  const q = normalizeText(query);
  return ACCESSORY_WORDS.some((word) => q.includes(normalizeText(word)));
}

function accessoryPenalty(title: string, query: string): number {
  if (queryLooksLikeAccessory(query)) return 0;

  const t = normalizeText(title);
  let penalty = 0;

  for (const word of ACCESSORY_WORDS) {
    if (t.includes(normalizeText(word))) penalty += 8;
  }

  for (const signal of ACCESSORY_SIGNALS) {
    if (t.includes(normalizeText(signal))) penalty += 3;
  }

  return Math.min(penalty, 24);
}

function relevanceScore(title: string, query: string): number {
  const t = normalizeText(title);
  const q = normalizeText(query);
  const queryTokens = tokenize(query);

  if (!queryTokens.length) return 0;

  const matchedTokens = queryTokens.filter((token) => t.includes(token));
  const coverage = matchedTokens.length / queryTokens.length;

  let score = coverage * 20;

  // La phrase exacte ou presque exacte est fortement privilégiée.
  if (t.includes(q)) score += 12;

  // Les références alphanumériques (RX1R, A7IV, 24-70...) sont très discriminantes.
  const modelTokens = queryTokens.filter(
    (token) => /\d/.test(token) && /[a-z]/.test(token),
  );
  if (modelTokens.length) {
    const modelMatches = modelTokens.filter((token) => t.includes(token)).length;
    score += (modelMatches / modelTokens.length) * 12;
    if (modelMatches < modelTokens.length) score -= 10;
  }

  score -= accessoryPenalty(title, query);

  return score;
}

function enrichedShoppingQuery(query: string): string {
  if (queryLooksLikeAccessory(query)) return query;

  // On aide Google Shopping à éviter les accessoires, mais le filtrage local
  // reste la sécurité principale car les opérateurs "-" ne sont pas toujours stricts.
  const negatives = [
    "batterie",
    "chargeur",
    "capuchon",
    "pare-soleil",
    "grip",
    "étui",
    "housse",
    "filtre",
    "sangle",
    "adaptateur",
    "cage",
  ];

  return `${query} ${negatives.map((word) => `-${word}`).join(" ")}`;
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

    const body = (await request.json().catch(() => null)) as
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
        q: mode === "purchase" ? enrichedShoppingQuery(query) : query,
        gl: "fr",
        hl: "fr",
        num: 20,
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

    const scored: PriceOffer[] = sourceRows
      .map((row: any, index: number): PriceOffer | null => {
        const url = normalizeUrl(row?.link ?? row?.url);
        if (!url) return null;

        const title = asText(row?.title) || asText(row?.name) || "Offre";
        const relevance =
          mode === "purchase" ? relevanceScore(title, query) : 20;

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
          relevance,
        };
      })
      .filter((item: PriceOffer | null): item is PriceOffer => item !== null);

    // Pour un achat, on n'affiche que des résultats suffisamment proches de la requête.
    // Une recherche d'accessoire explicite reste autorisée.
    const minimumRelevance = mode === "purchase" ? 14 : 0;
    const relevant = scored.filter((item) => item.relevance >= minimumRelevance);

    const items = relevant
      .sort((a, b) => {
        // La pertinence prime nettement sur le prix.
        const relevanceDiff = b.relevance - a.relevance;
        if (Math.abs(relevanceDiff) >= 3) return relevanceDiff;

        // À pertinence proche, le prix devient le critère de classement.
        if (a.price === null && b.price === null) return relevanceDiff;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      })
      .slice(0, 5)
      .map(({ relevance: _relevance, ...item }) => item);

    return NextResponse.json({
      items,
      filteredCount: Math.max(0, scored.length - relevant.length),
    });
  } catch (error) {
    console.error("[price-compare]", error);
    return NextResponse.json(
      { error: "Comparaison momentanément indisponible. Réessaie dans quelques instants." },
      { status: 500 },
    );
  }
}
