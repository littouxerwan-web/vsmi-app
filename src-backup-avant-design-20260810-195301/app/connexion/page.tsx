import { login } from "./actions";

type ConnexionPageProps = {
  searchParams: Promise<{
    erreur?: string;
  }>;
};

export default async function ConnexionPage({
  searchParams,
}: ConnexionPageProps) {
  const { erreur } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-5">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-neutral-400">
            Vue sur mer imprenable
          </p>

          <h1 className="mt-4 text-4xl font-semibold text-white">
            VSMI
          </h1>

          <p className="mt-3 text-sm text-neutral-400">
            Gestion de ton activité photographique
          </p>
        </div>

        {erreur ? (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {erreur}
          </div>
        ) : null}

        <form action={login} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-neutral-200"
            >
              Adresse e-mail
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-neutral-200"
            >
              Mot de passe
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-white/40"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-neutral-200"
          >
            Se connecter
          </button>
        </form>
      </section>
    </main>
  );
}