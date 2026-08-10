import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MomentPresenceRow } from "@/components/moment-presence-row";
import { WeddingAttachmentUploader } from "@/components/wedding-attachment-uploader";
import { deleteWedding, updateWedding } from "../actions";


export const dynamic = "force-dynamic";

type Wedding = {
  id: string;
  partner1_first_name: string | null;
  partner1_last_name: string | null;
  partner2_first_name: string | null;
  partner2_last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  wedding_date: string;
  formula: string | null;
  total_amount: number;
  color_delivery: boolean;
  black_white_delivery: boolean;
  notes: string | null;
  quote_path: string | null;
};

type Moment = {
  moment_type: string;
  label: string;
  location: string | null;
  scheduled_time: string | null;
  photographer_present: boolean;
};

type Payment = {
  id: string;
  payment_type: "deposit" | "balance";
  amount: number;
  expected_date: string | null;
  received_date: string | null;
  status: "expected" | "received" | "cancelled";
};

const MOMENT_TYPES = [
  ["preparation", "Préparation"],
  ["town_hall", "Mairie"],
  ["ceremony", "Église / cérémonie"],
  ["couple_photos", "Photos des mariés"],
  ["cocktail", "Vin d’honneur"],
  ["dinner", "Repas"],
  ["first_dance", "Première danse"],
] as const;

export default async function WeddingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creation?: string; modification?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const supabase = await createClient();

  const [{ data: weddingData, error }, { data: momentsData }, { data: paymentsData }] = await Promise.all([
    supabase.from("weddings").select("*").eq("id", id).single(),
    supabase.from("wedding_moments").select("moment_type, label, location, scheduled_time, photographer_present").eq("wedding_id", id).order("position"),
    supabase.from("wedding_payments").select("id, payment_type, amount, expected_date, received_date, status").eq("wedding_id", id).neq("status", "cancelled").order("expected_date"),
  ]);

  if (error || !weddingData) notFound();

  const wedding = weddingData as Wedding;
  const moments = (momentsData ?? []) as Moment[];
  const payments = (paymentsData ?? []) as Payment[];
  const momentMap = new Map(moments.map((moment) => [moment.moment_type, moment]));
  const updateAction = updateWedding.bind(null, id);
  const deleteAction = deleteWedding.bind(null, id);
  const deposit = payments.find((payment) => payment.payment_type === "deposit");
  const balances = payments.filter((payment) => payment.payment_type === "balance");
  const splitBalance = balances.length > 1;
  const received = payments.filter((payment) => payment.status === "received").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remaining = Math.max(0, Number(wedding.total_amount) - received);
  const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  let quoteUrl: string | null = null;
  if (wedding.quote_path) {
    const { data } = await supabase.storage.from("wedding-documents").createSignedUrl(wedding.quote_path, 1800);
    quoteUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/mariages" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-black">
          <ArrowLeft size={17} /> Retour à Mes Mariages
        </Link>

        {messages.creation || messages.modification ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">Mariage enregistré.</div>
        ) : null}
        {messages.erreur ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{messages.erreur}</div> : null}

        <form action={updateAction} className="mt-5 space-y-4 sm:mt-6 sm:space-y-6">
          <Card title="Mariés">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Prénom 1" name="partner1_first_name" defaultValue={wedding.partner1_first_name ?? ""} />
              <Field label="Nom 1" name="partner1_last_name" defaultValue={wedding.partner1_last_name ?? ""} />
              <Field label="Prénom 2" name="partner2_first_name" defaultValue={wedding.partner2_first_name ?? ""} />
              <Field label="Nom 2" name="partner2_last_name" defaultValue={wedding.partner2_last_name ?? ""} />
              <Field label="E-mail" name="email" type="email" defaultValue={wedding.email ?? ""} />
              <Field label="Téléphone" name="phone" type="tel" defaultValue={wedding.phone ?? ""} />
              <Field label="Adresse" name="address" defaultValue={wedding.address ?? ""} />
              <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
                <Field label="Code postal" name="postal_code" defaultValue={wedding.postal_code ?? ""} />
                <Field label="Ville" name="city" defaultValue={wedding.city ?? ""} />
              </div>
            </div>
          </Card>

          <Card title="Mariage et budget">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Date du mariage" name="wedding_date" type="date" defaultValue={wedding.wedding_date} required />
              <Field label="Formule" name="formula" defaultValue={wedding.formula ?? ""} />
              <Field label="Budget total (€)" name="total_amount" type="number" min="0.01" step="0.01" defaultValue={wedding.total_amount} required />
              <Field label="Date de l’acompte" name="deposit_received_date" type="date" defaultValue={deposit?.received_date ?? ""} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Kpi label="Budget" value={money.format(Number(wedding.total_amount))} />
              <Kpi label="Encaissé" value={money.format(received)} />
              <Kpi label="Reste" value={money.format(remaining)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-6">
              <Check name="color_delivery" label="Couleur" defaultChecked={wedding.color_delivery} />
              <Check name="black_white_delivery" label="Noir et blanc" defaultChecked={wedding.black_white_delivery} />
            </div>
          </Card>

          <Card title="Lieux, horaires et présence">
            <div className="space-y-4">
              {MOMENT_TYPES.map(([type, label]) => {
                const moment = momentMap.get(type);
                return <MomentPresenceRow key={type} type={type} label={label} location={moment?.location ?? ""} time={moment?.scheduled_time ?? ""} present={moment?.photographer_present ?? false} />;
              })}
            </div>
          </Card>

          <Card title="Solde">
            <p className="text-sm text-neutral-600">Le solde non encaissé est recalculé à chaque enregistrement.</p>
            <div className="mt-4"><Check name="split_balance" label="Étaler le solde en deux fois" defaultChecked={splitBalance} /></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Date échéance 1" name="balance_date_1" type="date" defaultValue={balances[0]?.expected_date ?? wedding.wedding_date} />
              <Field label="Date échéance 2" name="balance_date_2" type="date" defaultValue={balances[1]?.expected_date ?? ""} />
            </div>
          </Card>

          <Card title="Notes">
            <textarea name="notes" defaultValue={wedding.notes ?? ""} rows={9} className="w-full rounded-2xl border border-black/10 px-4 py-3 outline-none focus:border-black" />
          </Card>

          <div className="flex flex-wrap justify-between gap-3">
            <button formAction={deleteAction} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 px-5 py-3 text-sm font-medium text-red-700 hover:bg-red-50 sm:w-auto">
              <Trash2 size={17} /> Supprimer
            </button>
            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto">
              <Save size={18} /> Enregistrer
            </button>
          </div>
        </form>

        <section className="mt-4 rounded-3xl border border-black/10 bg-white p-4 shadow-sm sm:mt-6 sm:p-6">
          <h2 className="text-lg font-semibold sm:text-xl">Pièce jointe</h2>
          <div className="mt-4">
            <WeddingAttachmentUploader
              weddingId={id}
              currentPath={wedding.quote_path}
              currentUrl={quoteUrl}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm sm:p-6"><h2 className="text-lg font-semibold sm:text-xl">{title}</h2><div className="mt-4 sm:mt-6">{children}</div></section>;
}
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <label className="block"><span className="text-sm font-medium">{label}</span><input {...input} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 outline-none focus:border-black" /></label>;
}
function Check({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />{label}</label>;
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-neutral-100 p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
