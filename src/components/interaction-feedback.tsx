"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type FeedbackState = "idle" | "pending" | "done";

const STORAGE_KEY = "vsmi-action-scroll-position";
const MAX_AGE_MS = 30_000;

function saveScrollPosition(pathname: string) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pathname, y: window.scrollY, at: Date.now() }),
    );
  } catch {
    // sessionStorage can be unavailable in restricted browser modes.
  }
}

function readScrollPosition(pathname: string) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { pathname?: string; y?: number; at?: number };
    if (
      value.pathname !== pathname ||
      typeof value.y !== "number" ||
      typeof value.at !== "number" ||
      Date.now() - value.at > MAX_AGE_MS
    ) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    return Math.max(0, value.y);
  } catch {
    return null;
  }
}

export function InteractionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [navigationPending, setNavigationPending] = useState(false);
  const [showNavigationLoader, setShowNavigationLoader] = useState(false);
  const [state, setState] = useState<FeedbackState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationLoaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNavigationPending(false);
    setShowNavigationLoader(false);
    if (navigationLoaderTimer.current) {
      clearTimeout(navigationLoaderTimer.current);
      navigationLoaderTimer.current = null;
    }
    const targetY = readScrollPosition(pathname);
    if (targetY === null) return;

    // Wait until the refreshed page has laid out its content before restoring.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, left: 0, behavior: "auto" });
        setTimeout(() => window.scrollTo({ top: targetY, left: 0, behavior: "auto" }), 80);
      });
    });

    setState("done");
    const timer = setTimeout(() => setState("idle"), 1200);
    return () => clearTimeout(timer);
  }, [routeKey, pathname]);

  useEffect(() => {
    const clearResetTimer = () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = null;
    };

    const scheduleIdle = (delay = 3500) => {
      clearResetTimer();
      resetTimer.current = setTimeout(() => setState("idle"), delay);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;

      saveScrollPosition(window.location.pathname);
      setState("pending");

      const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
      form.dataset.vsmiSubmitting = "true";
      if (submitter) submitter.dataset.vsmiBusy = "true";

      // Do not use the disabled attribute: React/Next server actions may still
      // need the submitter value/formAction. Pointer-events prevents double clicks.
      window.setTimeout(() => {
        delete form.dataset.vsmiSubmitting;
        if (submitter) delete submitter.dataset.vsmiBusy;
      }, 6000);

      // If an action updates in-place without navigation, avoid leaving a stale toast.
      scheduleIdle(6000);
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "checkbox" && target.type !== "radio") return;

      saveScrollPosition(window.location.pathname);
      target.dataset.vsmiTouched = "true";
      setState("pending");

      window.setTimeout(() => delete target.dataset.vsmiTouched, 650);
      scheduleIdle(1800);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("button, a, summary, [role='button']")
          : null;
      if (!target) return;
      target.setAttribute("data-vsmi-pressed", "true");
      window.setTimeout(() => target.removeAttribute("data-vsmi-pressed"), 240);
    };

    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      let next: URL;
      try { next = new URL(link.href, window.location.href); } catch { return; }
      if (next.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}`;
      const target = `${next.pathname}${next.search}`;
      if (target === current && (!next.hash || next.hash === window.location.hash)) return;
      setNavigationPending(true);
      if (navigationLoaderTimer.current) clearTimeout(navigationLoaderTimer.current);
      navigationLoaderTimer.current = setTimeout(() => setShowNavigationLoader(true), 180);
      scheduleIdle(8000);
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);

    return () => {
      clearResetTimer();
      if (navigationLoaderTimer.current) clearTimeout(navigationLoaderTimer.current);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        button[data-vsmi-pressed="true"],
        a[data-vsmi-pressed="true"],
        summary[data-vsmi-pressed="true"],
        [role="button"][data-vsmi-pressed="true"] {
          transform: scale(0.965);
          opacity: 0.76;
          filter: brightness(0.9);
        }
        button[data-vsmi-busy="true"],
        form[data-vsmi-submitting="true"] button[type="submit"] {
          cursor: wait !important;
          pointer-events: none !important;
          opacity: 0.58 !important;
        }
        input[type="checkbox"][data-vsmi-touched="true"],
        input[type="radio"][data-vsmi-touched="true"] {
          outline: 3px solid rgba(0, 0, 0, 0.13);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: no-preference) {
          button,
          a,
          summary,
          [role="button"] {
            transition: transform 120ms ease, opacity 120ms ease, filter 120ms ease;
          }
          input[type="checkbox"],
          input[type="radio"] {
            transition: outline-color 160ms ease, transform 120ms ease;
          }
          input[type="checkbox"][data-vsmi-touched="true"],
          input[type="radio"][data-vsmi-touched="true"] {
            transform: scale(1.08);
          }
        }
      `}</style>


      {navigationPending && showNavigationLoader ? (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-[#0B0B0B]/96 backdrop-blur-sm" aria-live="polite" aria-label="Chargement de la page">
          <div className="flex flex-col items-center gap-4">
            <Image src="/vsmi-logo.gif" alt="VSMI" width={180} height={180} priority unoptimized className="h-auto w-32 object-contain sm:w-40" />
            <span className="h-1 w-24 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-1/2 animate-pulse rounded-full bg-[#D2AE57]" /></span>
          </div>
        </div>
      ) : null}

      {state !== "idle" && !navigationPending ? (
        <div
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-1/2 z-[200] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#D2AE57]/40 bg-[#111111]/96 px-5 py-3 text-sm font-semibold text-[#E3C97E] shadow-2xl backdrop-blur"
        >
          {state === "pending" ? "Action en cours…" : "✓ Mise à jour effectuée"}
        </div>
      ) : null}
    </>
  );
}
