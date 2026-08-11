"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "vsmi-theme-mode";

export function ThemeModeToggle() {
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    const enabled = window.localStorage.getItem(STORAGE_KEY) === "light";
    document.documentElement.classList.toggle("vsmi-light-mode", enabled);
    setLightMode(enabled);
  }, []);

  function toggleTheme() {
    const next = !lightMode;
    window.localStorage.setItem(STORAGE_KEY, next ? "light" : "dark");
    document.documentElement.classList.toggle("vsmi-light-mode", next);
    setLightMode(next);
  }

  const Icon = lightMode ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={lightMode}
      aria-label={lightMode ? "Passer en mode sombre" : "Passer en fond clair"}
      title={lightMode ? "Mode sombre" : "Mode clair"}
      data-private-visible="true"
      className={`grid size-10 place-items-center rounded-full border transition ${
        lightMode
          ? "border-[#D2AE57] bg-[#F4E8C4] text-[#5B4618]"
          : "border-white/15 bg-white/[0.06] text-[#C8C8C8] hover:border-[#D2AE57]/55 hover:bg-[#D2AE57]/10 hover:text-[#D2AE57]"
      }`}
    >
      <Icon size={18} />
    </button>
  );
}
