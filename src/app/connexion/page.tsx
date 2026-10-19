import { BrandMark } from "@/components/brand-mark";
import { SunFastMark } from "@/components/sun-fast-mark";
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
    <main className="premium-login flex min-h-screen items-center justify-center px-5 py-8">
      <section className="premium-login-card w-full max-w-md rounded-3xl border p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="premium-login-brand">
            <BrandMark className="premium-login-logo"/>
            <span className="premium-login-divider" aria-hidden="true"/>
            <SunFastMark className="premium-login-boat"/>
          </div>
          <h1 className="mt-6 text-xl font-medium text-white">Bienvenue dans VSMI</h1>
          <p className="mt-2 text-sm text-[#C1CCDC]">Votre quotidien, en équilibre.</p>
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
              className="w-full rounded-xl border border-white/10 bg-[#202B3D] px-4 py-3 text-white outline-none focus:border-[#DCC79D] focus:ring-2 focus:ring-[#DCC79D]/20"
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
              className="w-full rounded-xl border border-white/10 bg-[#202B3D] px-4 py-3 text-white outline-none focus:border-[#DCC79D] focus:ring-2 focus:ring-[#DCC79D]/20"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[#DCC79D] px-4 py-3 font-medium text-[#202B3D] transition hover:bg-[#EAD9B7]"
          >
            Se connecter
          </button>
        </form>
      </section>
    </main>
  );
}