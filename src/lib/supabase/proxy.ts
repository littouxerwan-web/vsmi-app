import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });

  // Une réponse qui transporte une session rafraîchie ne doit jamais être mise en cache.
  to.headers.set("Cache-Control", "private, no-store, max-age=0");
  to.headers.set("Pragma", "no-cache");
  to.headers.set("Expires", "0");

  return to;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isLoginRoute = pathname === "/connexion";
  const isAuthRoute = pathname.startsWith("/auth/");

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isLoginRoute || isAuthRoute) return response;

    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("erreur", "Configuration Supabase indisponible");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },

      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        response.headers.set("Cache-Control", "private, no-store, max-age=0");
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");
      },
    },
  });

  try {
    // Supabase recommande getClaims() dans le Proxy : il valide le JWT et
    // déclenche si nécessaire le rafraîchissement de la session SSR.
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as
      | {
          email?: string;
          app_metadata?: { role?: string; photo_access?: boolean };
        }
      | undefined;

    const authenticated = !error && Boolean(claims);

    if (isAuthRoute) {
      return response;
    }

    // Si l'utilisateur est encore authentifié, ne jamais lui montrer de nouveau
    // le formulaire de connexion : on le renvoie directement dans l'application.
    if (isLoginRoute) {
      if (!authenticated) return response;

      const appMetadata = claims?.app_metadata ?? {};
      const url = request.nextUrl.clone();
      if (appMetadata.role === "personal" || appMetadata.photo_access !== true) {
        url.pathname = "/perso";
        url.search = "?vue=finances";
      } else {
        url.pathname = "/aujourd-hui";
        url.search = "";
      }

      return copyAuthCookies(response, NextResponse.redirect(url));
    }

    if (!authenticated) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      return copyAuthCookies(response, NextResponse.redirect(url));
    }

    const appMetadata = claims?.app_metadata ?? {};

    // Les comptes personnels ont accès à PERSO et COMMUN, mais pas à PHOTO.
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

    // On ne détruit ni ne remplace les cookies en cas d'erreur réseau ponctuelle.
    // La prochaine requête pourra ainsi récupérer/rafraîchir la même session.
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
