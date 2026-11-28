"use client";

import {
  CheckCircle2,
  Mountain,
  PhoneCall,
  ShieldAlert,
  Waves,
  XCircle,
} from "lucide-react";
import { riskLevelLabel, type Lang, type Translations } from "@/lib/i18n";
import { RISK_COLORS, type RiskLevel } from "@/lib/risk";
import SafetyChat from "@/components/SafetyChat";

interface PrecautionPanelProps {
  cityLevel: RiskLevel;
  lang: Lang;
  t: Translations;
}

export default function PrecautionPanel({
  cityLevel,
  lang,
  t,
}: PrecautionPanelProps) {
  const dos = t.dosByRisk[cityLevel];
  const donts = t.dontsByRisk[cityLevel];
  const color = RISK_COLORS[cityLevel];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">
              {t.precautionsTitle}
            </h2>
          </div>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-slate-950"
            style={{ backgroundColor: color }}
          >
            {riskLevelLabel(cityLevel, t)}
          </span>
        </div>
        <p className="text-xs text-slate-400">{t.currentRiskAdvice}</p>
      </div>

      {/* Do's */}
      <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/30 p-4">
        <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-2 mb-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {t.dosTitle}
        </h3>
        <ul className="space-y-2">
          {dos.map((item, idx) => (
            <li
              key={idx}
              className="text-xs sm:text-sm text-slate-200 flex items-start gap-2"
            >
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Don'ts */}
      <div className="rounded-2xl bg-red-950/30 border border-red-500/30 p-4">
        <h3 className="text-sm font-semibold text-red-300 flex items-center gap-2 mb-2.5">
          <XCircle className="w-4 h-4 text-red-400" />
          {t.dontsTitle}
        </h3>
        <ul className="space-y-2">
          {donts.map((item, idx) => (
            <li
              key={idx}
              className="text-xs sm:text-sm text-slate-200 flex items-start gap-2"
            >
              <span className="text-red-400 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* AI Safety Assistant Chat */}
      <SafetyChat cityLevel={cityLevel} lang={lang} t={t} />

      {/* River Flood Specific */}
      <div className="rounded-2xl bg-sky-950/30 border border-sky-500/30 p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-sky-300 flex items-center gap-2 mb-2">
          <Waves className="w-4 h-4 text-sky-400 shrink-0" />
          {t.riverFloodTitle}
        </h3>
        <ul className="space-y-1.5">
          {t.riverFloodAdvice.map((item, idx) => (
            <li
              key={idx}
              className="text-xs text-slate-200 flex items-start gap-2"
            >
              <span className="text-sky-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Ghat Landslide Specific */}
      <div className="rounded-2xl bg-amber-950/30 border border-amber-500/30 p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-amber-300 flex items-center gap-2 mb-2">
          <Mountain className="w-4 h-4 text-amber-400 shrink-0" />
          {t.landslideTitle}
        </h3>
        <ul className="space-y-1.5">
          {t.landslideAdvice.map((item, idx) => (
            <li
              key={idx}
              className="text-xs text-slate-200 flex items-start gap-2"
            >
              <span className="text-amber-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Maharashtra Emergency Contacts */}
      <div className="rounded-2xl bg-slate-900/80 border border-cyan-500/25 p-4">
        <h3 className="text-sm font-semibold text-cyan-300 flex items-center gap-2 mb-3">
          <PhoneCall className="w-4 h-4 text-cyan-400" />
          {t.emergencyContacts}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <a
            href="tel:112"
            className="flex flex-col items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 p-2.5 text-center transition-colors"
          >
            <span className="text-base font-bold text-cyan-400">112 / 1070</span>
            <span className="text-[10px] text-slate-300 mt-0.5 leading-tight">
              {t.stateDisaster}
            </span>
          </a>
          <a
            href="tel:01124363260"
            className="flex flex-col items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 p-2.5 text-center transition-colors"
          >
            <span className="text-xs font-bold text-cyan-400">011-24363260</span>
            <span className="text-[10px] text-slate-300 mt-1 leading-tight">
              {t.ndrf}
            </span>
          </a>
          <a
            href="tel:1916"
            className="flex flex-col items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 p-2.5 text-center transition-colors"
          >
            <span className="text-base font-bold text-cyan-400">1916</span>
            <span className="text-[10px] text-slate-300 mt-0.5 leading-tight">
              {t.bmcDisaster}
            </span>
          </a>
          <a
            href="tel:100"
            className="flex flex-col items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 p-2.5 text-center transition-colors"
          >
            <span className="text-base font-bold text-cyan-400">100</span>
            <span className="text-[10px] text-slate-300 mt-0.5 leading-tight">
              {t.police}
            </span>
          </a>
          <a
            href="tel:101"
            className="flex flex-col items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 p-2.5 text-center transition-colors"
          >
            <span className="text-base font-bold text-cyan-400">101</span>
            <span className="text-[10px] text-slate-300 mt-0.5 leading-tight">
              {t.fireBrigade}
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
