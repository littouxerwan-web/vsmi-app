"use client";

import { usePathname } from "next/navigation";
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
  const [state, setState] = useState<FeedbackState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
  }, [pathname]);

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
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target || target.closest("a")) return;
      target.setAttribute("data-vsmi-pressed", "true");
      window.setTimeout(() => target.removeAttribute("data-vsmi-pressed"), 220);
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      clearResetTimer();
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        button[data-vsmi-pressed="true"] {
          transform: scale(0.97);
          opacity: 0.78;
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
          button {
            transition: transform 120ms ease, opacity 120ms ease;
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

      {state !== "idle" ? (
        <div
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-3 z-[200] -translate-x-1/2 rounded-full border border-black/10 bg-black px-4 py-2 text-xs font-semibold text-white shadow-xl"
        >
          {state === "pending" ? "Action en cours…" : "✓ Mise à jour effectuée"}
        </div>
      ) : null}
    </>
  );
}
