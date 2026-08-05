"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "vsmi-private-mode";
const TARGET_ID = "app-private-content";

function maskDigits(value: string) {
  return value.replace(/\d/g, "•");
}

export function PrivacyModeToggle() {
  const [privateMode, setPrivateMode] = useState(false);
  const originalsRef = useRef(new Map<Text, string>());
  const observerRef = useRef<MutationObserver | null>(null);
  const applyingMaskRef = useRef(false);

  useEffect(() => {
    // Nettoyage de l’ancienne version du mode privé qui ajoutait un voile
    // et floutait toute la page.
    document.querySelectorAll(".private-mode-shield").forEach((node) => node.remove());

    const enabled = window.localStorage.getItem(STORAGE_KEY) === "1";
    setPrivateMode(enabled);
  }, []);

  useEffect(() => {
    const root = document.getElementById(TARGET_ID);
    if (!root) return;

    const originals = originalsRef.current;

    function shouldIgnore(node: Text) {
      const parent = node.parentElement;
      if (!parent) return true;
      return Boolean(
        parent.closest(
          "script, style, noscript, svg, [data-private-visible='true'], [aria-hidden='true']",
        ),
      );
    }

    function maskTextNode(node: Text) {
      if (shouldIgnore(node) || !/\d/.test(node.data)) return;

      if (!originals.has(node)) {
        originals.set(node, node.data);
      } else if (!applyingMaskRef.current && /\d/.test(node.data)) {
        // React peut réécrire le texte pendant la navigation : on garde alors
        // cette nouvelle valeur comme référence avant de la masquer à nouveau.
        originals.set(node, node.data);
      }

      const masked = maskDigits(originals.get(node) ?? node.data);
      if (node.data !== masked) {
        applyingMaskRef.current = true;
        node.data = masked;
        applyingMaskRef.current = false;
      }
    }

    function maskTree(start: Node) {
      if (start.nodeType === Node.TEXT_NODE) {
        maskTextNode(start as Text);
        return;
      }

      const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        maskTextNode(current as Text);
        current = walker.nextNode();
      }
    }

    function restore() {
      observerRef.current?.disconnect();
      observerRef.current = null;
      applyingMaskRef.current = true;
      for (const [node, original] of originals) {
        if (node.isConnected) node.data = original;
      }
      originals.clear();
      applyingMaskRef.current = false;
    }

    document.documentElement.classList.toggle("vsmi-private-mode", privateMode);

    if (!privateMode) {
      restore();
      return () => undefined;
    }

    maskTree(root);

    const observer = new MutationObserver((mutations) => {
      if (applyingMaskRef.current) return;

      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const node = mutation.target as Text;
          if (/\d/.test(node.data)) {
            originals.set(node, node.data);
            maskTextNode(node);
          }
          continue;
        }

        for (const addedNode of mutation.addedNodes) {
          maskTree(addedNode);
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    observerRef.current = observer;

    return restore;
  }, [privateMode]);

  function togglePrivateMode() {
    const next = !privateMode;
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    setPrivateMode(next);
  }

  const Icon = privateMode ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={togglePrivateMode}
      aria-pressed={privateMode}
      aria-label={privateMode ? "Afficher les chiffres" : "Masquer les chiffres"}
      title={privateMode ? "Afficher les chiffres" : "Masquer les chiffres"}
      data-private-visible="true"
      className={`grid size-10 place-items-center rounded-full border transition ${
        privateMode
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black hover:bg-neutral-100"
      }`}
    >
      <Icon size={18} />
    </button>
  );
}
