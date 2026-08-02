import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { createWedding } from "../actions";

export default async function NewWeddingPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/mariages" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-black">
          <ArrowLeft size={17} /> Retour à Mes Mariages
        </Link>

        <div className="mt-6">
          <p className="text-sm font-medium text-neutral-500">Réservation confirmée</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Nouveau mariage</h1>
          <p className="mt-2 text-neutral-600">L’acompte de 20 % sera enregistré automatiquement en comptabilité.</p>
        </div>

        {erreur ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{erreur}</div> : null}

        <form action={createWedding} className="mt-5 space-y-4 sm:mt-6 sm:space-y-6">
          <Card title="Mariés">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Prénom 1" name="partner1_first_name" />
              <Field label="Nom 1" name="partner1_last_name" />
              <Field label="Prénom 2" name="partner2_first_name" />
              <Field label="Nom 2" name="partner2_last_name" />
              <Field label="E-mail" name="email" type="email" />
              <Field label="Téléphone" name="phone" type="tel" />
              <Field label="Adresse" name="address" />
              <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
                <Field label="Code postal" name="postal_code" />
                <Field label="Ville" name="city" />
              </div>
            </div>
          </Card>

          <Card title="Mariage et budget">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date du mariage" name="wedding_date" type="date" required />
              <Field label="Formule" name="formula" placeholder="Ex. Journée complète" />
              <Field label="Budget total (€)" name="total_amount" type="number" min="0.01" step="0.01" required />
              <Field label="Date d’encaissement de l’acompte" name="deposit_received_date" type="date" defaultValue={today} required />
            </div>
            <div className="mt-5 flex flex-wrap gap-6">
              <Check name="color_delivery" label="Couleur" defaultChecked />
              <Check name="black_white_delivery" label="Noir et blanc" />
            </div>
          </Card>

          <Card title="Lieux, horaires et présence">
            <div className="space-y-4">
              {MOMENTS.map((moment) => <MomentFields key={moment.type} {...moment} />)}
            </div>
          </Card>

          <Card title="Solde">
            <p className="text-sm text-neutral-600">Par défaut, le solde de 80 % est prévu à la date du mariage.</p>
            <div className="mt-4">
              <Check name="split_balance" label="Étaler le solde en deux fois" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Date échéance 1" name="balance_date_1" type="date" />
              <Field label="Date échéance 2" name="balance_date_2" type="date" />
            </div>
          </Card>

          <Card title="Notes">
            <textarea name="notes" rows={8} className="w-full rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-black" />
          </Card>

          <div className="flex justify-end">
            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto">
              <Save size={18} /> Créer le mariage
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

const MOMENTS = [
  { type: "preparation", label: "Préparation" },
  { type: "town_hall", label: "Mairie" },
  { type: "ceremony", label: "Église / cérémonie" },
  { type: "couple_photos", label: "Photos des mariés" },
  { type: "cocktail", label: "Vin d’honneur" },
  { type: "dinner", label: "Repas" },
  { type: "first_dance", label: "Première danse" },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-6">{children}</div></section>;
}
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <label className="block"><span className="text-sm font-medium">{label}</span><input {...input} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 outline-none focus:border-black" /></label>;
}
function Check({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />{label}</label>;
}
function MomentFields({ type, label }: { type: string; label: string }) {
  return <div className="grid gap-4 rounded-2xl border border-black/10 p-4 md:grid-cols-[170px_1fr_130px_170px] md:items-end"><p className="pb-3 font-semibold">{label}</p><Field label="Lieu" name={`${type}_location`} /><Field label="Horaire" name={`${type}_time`} type="time" /><div className="pb-3"><Check name={`${type}_present`} label="Présent" /></div></div>;
}
