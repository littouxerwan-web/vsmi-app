import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
  return noStore(to);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname === "/connexion";
  const isAuthRoute = pathname.startsWith("/auth/");

  let response = noStore(NextResponse.next({ request }));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isLoginRoute || isAuthRoute) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("erreur", "Configuration Supabase indisponible");
    return noStore(NextResponse.redirect(url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = noStore(NextResponse.next({ request }));
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    // Une seule méthode de validation pour le proxy et le layout : getClaims().
    // Elle valide le JWT et permet au client SSR de rafraîchir les cookies si besoin.
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as
      | {
          sub?: string;
          email?: string;
          app_metadata?: { role?: string; photo_access?: boolean };
          user_metadata?: { first_name?: string };
        }
      | undefined;

    const authenticated = !error && Boolean(claims?.sub);

    // IMPORTANT : ne jamais rediriger automatiquement /connexion vers l'app.
    // Cela supprime toute possibilité de boucle proxy <-> layout pendant un refresh.
    if (isLoginRoute || isAuthRoute) return response;

    if (!authenticated) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      return copyAuthCookies(response, NextResponse.redirect(url));
    }

    const appMetadata = claims?.app_metadata ?? {};

    // Un compte personnel peut naviguer dans PERSO et COMMUN uniquement.
    if (
      appMetadata.role === "personal" &&
      !pathname.startsWith("/perso") &&
      !pathname.startsWith("/commun")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/perso";
      url.search = "?vue=finances";
      return copyAuthCookies(response, NextResponse.redirect(url));
    }

    return response;
  } catch (error) {
    console.error("Échec Supabase Auth dans le proxy :", error);

    if (isLoginRoute || isAuthRoute) return response;

    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set(
      "erreur",
      "Vérification de session momentanément indisponible. Réessaie dans quelques secondes.",
    );
    return copyAuthCookies(response, NextResponse.redirect(url));
  }
}
