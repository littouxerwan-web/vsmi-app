"use client";

import { useState } from "react";
import { ExternalLink, Search, Loader2, Scale } from "lucide-react";

type Offer = {
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

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function PriceComparator({
  initialQuery = "",
  referencePrice = 0,
  mode = "purchase",
  compact = false,
}: {
  initialQuery?: string;
  referencePrice?: number;
  mode?: "purchase" | "subscription";
  compact?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const run = async () => {
    if (query.trim().length < 2) return;

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const response = await fetch("/api/price-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), mode }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          response.status === 404
            ? "Le module serveur du comparateur n’est pas installé."
            : "Réponse inattendue du comparateur.",
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Comparaison indisponible",
        );
      }

      const validItems = Array.isArray(data?.items)
        ? data.items.filter(
            (item: Offer) =>
              item &&
              typeof item.title === "string" &&
              typeof item.url === "string" &&
              safeExternalUrl(item.url) !== null,
          )
        : [];

      setOffers(validItems);
    } catch (err) {
      setOffers([]);
      setError(
        err instanceof Error ? err.message : "Comparaison indisponible",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-black/10 bg-white ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-center gap-2">
        <Scale size={16} />
        <strong className="text-sm">
          Comparer {mode === "subscription" ? "cet abonnement" : "les prix"}
        </strong>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void run();
            }
          }}
          placeholder={
            mode === "subscription"
              ? "Ex. Netflix Premium, forfait mobile…"
              : "Produit, modèle, référence…"
          }
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || query.trim().length < 2}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Search size={15} />
          )}
          Comparer
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {error}
        </p>
      ) : null}

      {!error && searched && !loading && offers.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          Aucune offre exploitable trouvée. Essaie une référence plus précise.
        </p>
      ) : null}

      {offers.length ? (
        <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
          {offers.map((offer, index) => {
            const href = safeExternalUrl(offer.url);
            const saving =
              referencePrice > 0 && offer.price !== null
                ? referencePrice - offer.price
                : null;

            return (
              <div
                key={offer.id}
                className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {index === 0 && offer.price !== null
                      ? "Meilleur prix · "
                      : ""}
                    {offer.title}
                  </p>

                  <p className="text-xs text-neutral-500">
                    {offer.seller}
                    {offer.delivery ? ` · ${offer.delivery}` : ""}
                  </p>

                  {saving !== null && saving > 0 ? (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Économie vs référence :{" "}
                      {saving.toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                      {mode === "subscription"
                        ? " / période saisie"
                        : ""}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <strong>{offer.priceLabel}</strong>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                    >
                      Voir <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-2 text-[11px] leading-4 text-neutral-400">
        Prix indicatifs issus du web au moment de la recherche. Vérifie le prix
        final, la livraison, l’engagement et les conditions chez le vendeur.
      </p>
    </div>
  );
}
