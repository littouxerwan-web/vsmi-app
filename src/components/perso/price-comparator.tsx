"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Search, Scale } from "lucide-react";

type CompareMode = "purchase" | "subscription";

type Offer = {
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

function euro(value: number): string {
  return value.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function PriceComparator({
  initialQuery = "",
  referencePrice = 0,
  mode: initialMode = "purchase",
  compact = false,
}: {
  initialQuery?: string;
  referencePrice?: number;
  mode?: CompareMode;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [query, setQuery] = useState(initialQuery);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const [subscriptionReference, setSubscriptionReference] = useState(
    initialMode === "subscription" && referencePrice > 0 ? String(referencePrice) : "",
  );
  const [subscriptionCategory, setSubscriptionCategory] = useState("");
  const [subscriptionProvider, setSubscriptionProvider] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [subscriptionNeeds, setSubscriptionNeeds] = useState("");
  const [subscriptionCommitment, setSubscriptionCommitment] = useState("");
  const [subscriptionLocation, setSubscriptionLocation] = useState("");

  const referenceMonthly = useMemo(() => {
    const value = Number.parseFloat(subscriptionReference.replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [subscriptionReference]);

  const run = async () => {
    if (query.trim().length < 2) return;

    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const response = await fetch("/api/price-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          mode,
          subscriptionDetails:
            mode === "subscription"
              ? {
                  category: subscriptionCategory,
                  provider: subscriptionProvider,
                  plan: subscriptionPlan,
                  needs: subscriptionNeeds,
                  commitment: subscriptionCommitment,
                  location: subscriptionLocation,
                }
              : undefined,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Réponse inattendue du comparateur.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Recherche indisponible",
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
      setError(err instanceof Error ? err.message : "Recherche indisponible");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: CompareMode) => {
    setMode(nextMode);
    setOffers([]);
    setError("");
    setSearched(false);
  };

  return (
    <div className={`rounded-2xl border border-black/10 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale size={16} />
          <strong className="text-sm">Comparer</strong>
        </div>

        <div className="inline-flex rounded-xl border border-black/10 bg-black/[0.03] p-1">
          <button
            type="button"
            onClick={() => switchMode("purchase")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === "purchase" ? "bg-black text-white" : "text-neutral-600"
            }`}
          >
            Achat ponctuel
          </button>
          <button
            type="button"
            onClick={() => switchMode("subscription")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === "subscription" ? "bg-black text-white" : "text-neutral-600"
            }`}
          >
            Abonnement
          </button>
        </div>
      </div>

      {mode === "purchase" ? (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Produit, modèle, référence exacte…"
          className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
        />
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ce que tu veux comparer : ex. forfait mobile 100 Go"
              className="min-w-0 rounded-xl border px-3 py-2 text-sm"
            />
            <div className="relative">
              <input
                inputMode="decimal"
                value={subscriptionReference}
                onChange={(event) => setSubscriptionReference(event.target.value)}
                placeholder="Prix actuel / mois"
                className="w-full rounded-xl border px-3 py-2 pr-8 text-sm"
              />
              <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-neutral-400">
                €
              </span>
            </div>
          </div>

          <details className="rounded-xl border border-black/10 bg-black/[0.02]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium">
              Préciser l’abonnement
              <ChevronDown size={14} />
            </summary>

            <div className="grid gap-2 border-t border-black/10 p-3 sm:grid-cols-2">
              <select
                value={subscriptionCategory}
                onChange={(event) => setSubscriptionCategory(event.target.value)}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                <option value="">Type d’abonnement</option>
                <option value="forfait mobile">Forfait mobile</option>
                <option value="internet fibre">Internet / Fibre</option>
                <option value="streaming video">Streaming vidéo</option>
                <option value="streaming musique">Streaming musique</option>
                <option value="assurance">Assurance</option>
                <option value="logiciel SaaS">Logiciel / SaaS</option>
                <option value="salle de sport">Salle de sport</option>
                <option value="énergie électricité gaz">Énergie</option>
                <option value="autre abonnement">Autre</option>
              </select>

              <input
                value={subscriptionProvider}
                onChange={(event) => setSubscriptionProvider(event.target.value)}
                placeholder="Fournisseur actuel : ex. Orange"
                className="rounded-xl border px-3 py-2 text-sm"
              />

              <input
                value={subscriptionPlan}
                onChange={(event) => setSubscriptionPlan(event.target.value)}
                placeholder="Offre actuelle : ex. 200 Go 5G"
                className="rounded-xl border px-3 py-2 text-sm"
              />

              <input
                value={subscriptionCommitment}
                onChange={(event) => setSubscriptionCommitment(event.target.value)}
                placeholder="Engagement : ex. sans engagement"
                className="rounded-xl border px-3 py-2 text-sm"
              />

              <input
                value={subscriptionLocation}
                onChange={(event) => setSubscriptionLocation(event.target.value)}
                placeholder="Zone / ville si utile"
                className="rounded-xl border px-3 py-2 text-sm"
              />

              <input
                value={subscriptionNeeds}
                onChange={(event) => setSubscriptionNeeds(event.target.value)}
                placeholder="Besoins : ex. ≥100 Go, appels illimités, eSIM"
                className="rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </details>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || query.trim().length < 2}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {mode === "subscription" ? "Comparer les offres" : "Rechercher des offres"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {error}
        </p>
      ) : null}

      {!error && searched && !loading && offers.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-500">
          {mode === "subscription"
            ? "Aucune offre suffisamment précise trouvée. Complète les critères de l’abonnement et relance la recherche."
            : "Aucune offre suffisamment fiable trouvée. Essaie la référence exacte du produit."}
        </p>
      ) : null}

      {offers.length ? (
        <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
          {offers.map((offer) => {
            const href = safeExternalUrl(offer.url);
            const monthlySaving =
              mode === "subscription" &&
              referenceMonthly > 0 &&
              offer.monthlyPrice != null
                ? referenceMonthly - offer.monthlyPrice
                : null;

            const purchaseSaving =
              mode === "purchase" &&
              referencePrice > 0 &&
              offer.price !== null
                ? referencePrice - offer.price
                : null;

            return (
              <div key={offer.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{offer.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{offer.seller}</p>

                  {mode === "subscription" && offer.snippet ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
                      {offer.snippet}
                    </p>
                  ) : null}

                  {monthlySaving !== null ? (
                    <p className={`mt-1 text-xs font-medium ${monthlySaving > 0 ? "text-emerald-700" : "text-neutral-500"}`}>
                      {monthlySaving > 0
                        ? `Économie : ${euro(monthlySaving)}/mois · ${euro(monthlySaving * 12)}/an`
                        : monthlySaving < 0
                          ? `Plus cher de ${euro(Math.abs(monthlySaving))}/mois`
                          : "Même coût mensuel"}
                    </p>
                  ) : null}

                  {purchaseSaving !== null && purchaseSaving > 0 ? (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Économie vs référence : {euro(purchaseSaving)}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="text-right">
                    <strong>{offer.priceLabel}</strong>
                    {mode === "subscription" && offer.annualPrice != null ? (
                      <div className="text-[11px] text-neutral-400">
                        {euro(offer.annualPrice)}/an
                      </div>
                    ) : null}
                  </div>

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
        {mode === "subscription"
          ? "Tarifs indicatifs trouvés sur le web. Vérifie les promotions temporaires, frais, engagement, éligibilité et conditions avant de changer d’offre."
          : "Offres indicatives trouvées sur le web. Vérifie le prix final, la livraison et les conditions chez le vendeur."}
      </p>
    </div>
  );
}
