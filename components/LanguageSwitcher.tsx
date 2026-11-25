"use client";

import { LANG_LABELS, type Lang } from "@/lib/i18n";

interface LanguageSwitcherProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

// Marathi first as requested
const LANGS: Lang[] = ["mr", "en", "hi"];

export default function LanguageSwitcher({
  lang,
  onChange,
}: LanguageSwitcherProps) {
  return (
    <div
      className="inline-flex items-center rounded-xl bg-slate-900/90 p-1 border border-cyan-500/25 shrink-0"
      role="group"
      aria-label="Language switcher"
    >
      {LANGS.map((code) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors min-h-[34px] ${
              active
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-800/70"
            }`}
          >
            {LANG_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
