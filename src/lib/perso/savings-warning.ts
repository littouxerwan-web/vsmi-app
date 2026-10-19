import type { RPSavingsWarning } from "./reliable-projection-engine";

const money = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

/** One explanation for both dashboards; never changes or recreates a stored decision. */
export function savingsWarningMessage(warning: RPSavingsWarning, checkingName: string, savingsName: string) {
  const explanations = {
    accepted: "Aucun virement supplémentaire n’a été validé pour couvrir ce nouveau besoin. Les virements précédents sont conservés.",
    deleted: "La proposition de cette période a été supprimée. Elle n’est pas recréée automatiquement.",
    limited: "Le montant retenu pour cette proposition ne couvre pas tout le besoin. Il est conservé sans modification automatique.",
    insufficient: "L’épargne mobilisable pour cette proposition ne suffit pas à couvrir tout le besoin.",
  };
  return {
    title: `${warning.reason === "insufficient" ? "Épargne insuffisante" : "Besoin de trésorerie non couvert"} pour protéger ${checkingName} — à partir du ${warning.needDate.split("-").reverse().join("/")}`,
    detail: `Besoin : ${money(warning.required)} · mobilisable sur ${savingsName} : ${money(warning.available)} · complément projeté : ${money(warning.applied)} · reste à couvrir : ${money(warning.missing)}. ${explanations[warning.reason]}`,
  };
}
