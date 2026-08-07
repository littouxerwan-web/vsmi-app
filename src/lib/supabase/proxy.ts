import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isPublicRoute =
    pathname === "/connexion" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json";

  /*
   * Ne jamais bloquer la page de connexion sur une requête Auth.
   * L'authentification sera effectuée uniquement lors de l'envoi du formulaire.
   */
  if (isPublicRoute) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
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
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      return NextResponse.redirect(url);
    }

    // Un compte marqué app_metadata.role = "personal" est strictement limité
    // au module PERSONNEL. Ce contrôle serveur complète le masquage de navigation.
    if (user.app_metadata?.role === "personal" && !pathname.startsWith("/perso")) {
      const url = request.nextUrl.clone();
      url.pathname = "/perso";
      url.search = "?vue=finances";
      return NextResponse.redirect(url);
    }

    return response;
  } catch (error) {
    console.error("Échec Supabase Auth dans le proxy :", error);

    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("erreur", "Connexion au service momentanément impossible");

    return NextResponse.redirect(url);
  }
}
