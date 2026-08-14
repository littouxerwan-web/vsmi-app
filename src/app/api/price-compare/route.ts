import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompareMode = "purchase" | "subscription";

type SubscriptionDetails = {
  category?: string;
  provider?: string;
  plan?: string;
  needs?: string;
  commitment?: string;
  location?: string;
};

type PriceOffer = {
  id: string;
  title: string;
  seller: string;
  url: string;
  priceLabel: string;
  price: number | null;
  delivery?: string | null;
  monthlyPrice?: number | null;
  annualPrice?: number | null;
  snippet?: string | null;
  relevance: number;
};

const ACCESSORY_WORDS = [
  "accessoire", "accessoires", "batterie", "battery", "chargeur", "charger",
  "capuchon", "bouchon", "lens cap", "pare soleil", "pare-soleil", "hood",
  "grip", "thumb grip", "poignee", "poignée", "etui", "étui", "case", "housse",
  "protection", "protection ecran", "protection écran", "coque", "filtre", "filter",
  "cpl", "mist", "sangle", "strap", "adaptateur", "adapter", "cable", "câble",
  "support", "mount", "cage", "verre trempe", "verre trempé", "screen protector",
  "bracket", "thumb bracket", "hot shoe", "cold shoe", "skin", "cover",
];

const STOP_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "pour", "avec",
  "the", "for", "with", "offre", "prix", "abonnement",
]);

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUrl(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
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

function purchaseRelevance(title: string, query: string): number {
  const t = normalizeText(title);
  const q = normalizeText(query);
  const tokens = tokenize(query);
  if (!tokens.length) return 0;

  const matched = tokens.filter((token) => t.includes(token));
  const coverage = matched.length / tokens.length;

  let score = coverage * 24;
  if (t.includes(q)) score += 14;

  const modelTokens = tokens.filter((token) => /\d/.test(token));
  if (modelTokens.length) {
    const modelMatches = modelTokens.filter((token) => t.includes(token)).length;
    score += (modelMatches / modelTokens.length) * 14;
    if (modelMatches < modelTokens.length) score -= 12;
  }

  if (!queryLooksLikeAccessory(query)) {
    for (const word of ACCESSORY_WORDS) {
      if (t.includes(normalizeText(word))) score -= 12;
    }
  }

  return score;
}

function extractMonthlyPrice(text: string): number | null {
  const normalized = text.replace(/\u00a0/g, " ");
  const patterns = [
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*€\s*(?:\/|par)?\s*(?:mois|month|mth)/i,
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:euros?|eur)\s*(?:\/|par)?\s*(?:mois|month)/i,
    /(?:mois|month)[^\d]{0,12}(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const value = Number.parseFloat(match[1].replace(",", "."));
      if (Number.isFinite(value) && value > 0 && value < 5000) return value;
    }
  }
  return null;
}

function extractAnnualPrice(text: string): number | null {
  const normalized = text.replace(/\u00a0/g, " ");
  const patterns = [
    /(\d{1,5}(?:[.,]\d{1,2})?)\s*€\s*(?:\/|par)?\s*(?:an|année|annee|year)/i,
    /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:euros?|eur)\s*(?:\/|par)?\s*(?:an|année|annee|year)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const value = Number.parseFloat(match[1].replace(",", "."));
      if (Number.isFinite(value) && value > 0 && value < 50000) return value;
    }
  }
  return null;
}

function purchaseQuery(query: string): string {
  if (queryLooksLikeAccessory(query)) return query;
  return `${query} produit neuf France -batterie -chargeur -capuchon -pare-soleil -grip -étui -housse -filtre -protection -bracket -cage`;
}

function buildSubscriptionQuery(query: string, details: SubscriptionDetails): string {
  const parts = [
    query,
    asText(details.category),
    asText(details.provider),
    asText(details.plan),
    asText(details.needs),
    asText(details.commitment),
    asText(details.location),
    "abonnement tarif prix par mois offre France",
  ].filter(Boolean);

  return parts.join(" ");
}

function subscriptionRelevance(
  text: string,
  query: string,
  details: SubscriptionDetails,
): number {
  const haystack = normalizeText(text);
  const coreTokens = tokenize(query);
  const detailText = [
    details.category,
    details.provider,
    details.plan,
    details.needs,
    details.commitment,
    details.location,
  ]
    .map(asText)
    .filter(Boolean)
    .join(" ");
  const detailTokens = tokenize(detailText);

  let score = 0;

  if (coreTokens.length) {
    const matchedCore = coreTokens.filter((token) => haystack.includes(token)).length;
    score += (matchedCore / coreTokens.length) * 22;
  }

  if (detailTokens.length) {
    const matchedDetails = detailTokens.filter((token) => haystack.includes(token)).length;
    score += (matchedDetails / detailTokens.length) * 18;
  }

  if (extractMonthlyPrice(text) !== null || extractAnnualPrice(text) !== null) {
    score += 8;
  }

  return score;
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
      | {
          query?: unknown;
          mode?: unknown;
          subscriptionDetails?: SubscriptionDetails;
        }
      | null;

    const query = asText(body?.query);
    const mode: CompareMode = body?.mode === "subscription" ? "subscription" : "purchase";
    const subscriptionDetails: SubscriptionDetails = body?.subscriptionDetails ?? {};

    if (query.length < 2) {
      return NextResponse.json(
        { error: "Saisis au moins 2 caractères pour lancer la recherche." },
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
        q:
          mode === "subscription"
            ? buildSubscriptionQuery(query, subscriptionDetails)
            : purchaseQuery(query),
        gl: "fr",
        hl: "fr",
        num: mode === "subscription" ? 25 : 30,
      }),
      cache: "no-store",
    });

    const rawText = await serperResponse.text();
    let data: any = null;

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return NextResponse.json(
        { error: "Réponse inattendue du service de recherche." },
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
        ? Array.isArray(data?.organic) ? data.organic : []
        : Array.isArray(data?.shopping) ? data.shopping : [];

    const scored: PriceOffer[] = sourceRows
      .map((row: any, index: number): PriceOffer | null => {
        const url = normalizeUrl(row?.link ?? row?.url);
        if (!url) return null;

        const title = asText(row?.title) || asText(row?.name) || "Offre";
        const snippet = asText(row?.snippet);
        const combinedText = `${title} ${snippet}`;

        const relevance =
          mode === "subscription"
            ? subscriptionRelevance(combinedText, query, subscriptionDetails)
            : purchaseRelevance(title, query);

        const seller =
          asText(row?.source) ||
          asText(row?.seller) ||
          sellerFromUrl(url);

        let price =
          asNumber(row?.extractedPrice) ??
          asNumber(row?.price) ??
          asNumber(row?.priceValue);

        let monthlyPrice: number | null = null;
        let annualPrice: number | null = null;

        if (mode === "subscription") {
          monthlyPrice = extractMonthlyPrice(combinedText);
          annualPrice = extractAnnualPrice(combinedText);

          if (monthlyPrice === null && annualPrice !== null) monthlyPrice = annualPrice / 12;
          if (annualPrice === null && monthlyPrice !== null) annualPrice = monthlyPrice * 12;

          price = monthlyPrice;
        }

        const priceLabel =
          mode === "subscription"
            ? monthlyPrice !== null
              ? `${monthlyPrice.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €/mois`
              : "Tarif à vérifier"
            : asText(row?.price) ||
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
          monthlyPrice,
          annualPrice,
          snippet: snippet || null,
          relevance,
        };
      })
      .filter((item: PriceOffer | null): item is PriceOffer => item !== null);

    const minimumRelevance = mode === "subscription" ? 10 : 18;
    let relevant = scored.filter((item) => item.relevance >= minimumRelevance);

    if (mode === "purchase" && !queryLooksLikeAccessory(query)) {
      relevant = relevant.filter((item) => {
        const title = normalizeText(item.title);
        return !ACCESSORY_WORDS.some((word) => title.includes(normalizeText(word)));
      });
    }

    const items = relevant
      .sort((a, b) => {
        const relevanceDiff = b.relevance - a.relevance;
        if (Math.abs(relevanceDiff) >= 4) return relevanceDiff;

        if (a.price === null && b.price === null) return relevanceDiff;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      })
      .slice(0, mode === "subscription" ? 6 : 5)
      .map(({ relevance: _relevance, ...item }) => item);

    return NextResponse.json({
      mode,
      items,
      filteredCount: Math.max(0, scored.length - relevant.length),
    });
  } catch (error) {
    console.error("[price-compare]", error);
    return NextResponse.json(
      { error: "Recherche momentanément indisponible. Réessaie dans quelques instants." },
      { status: 500 },
    );
  }
}
