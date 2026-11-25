"use client";

import { AlertTriangle } from "lucide-react";
import { hotspotDisplayName, type Lang, type Translations } from "@/lib/i18n";
import type { HotspotRisk, RiskLevel } from "@/lib/risk";

interface AlertBannerProps {
  cityLevel: RiskLevel;
  hotspotRisks: HotspotRisk[];
  lang: Lang;
  t: Translations;
}

export default function AlertBanner({
  cityLevel,
  hotspotRisks,
  lang,
  t,
}: AlertBannerProps) {
  if (cityLevel !== "high" && cityLevel !== "severe") {
    return null;
  }

  const riskyAreas = hotspotRisks
    .filter((h) => h.level === "high" || h.level === "severe")
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((h) => hotspotDisplayName(h.hotspot, lang));

  if (riskyAreas.length === 0) return null;

  const isSevere = cityLevel === "severe";

  return (
    <div
      role="alert"
      className={`px-3 py-2 text-xs sm:text-sm font-medium flex items-center gap-2 border-b ${
        isSevere
          ? "bg-red-950/90 border-red-500/50 text-red-100"
          : "bg-orange-950/90 border-orange-500/50 text-orange-100"
      }`}
    >
      <AlertTriangle
        className={`w-4 h-4 shrink-0 ${
          isSevere ? "text-red-400" : "text-orange-400"
        }`}
      />
      <span className="truncate">
        {t.alertHighSevere}{" "}
        <strong className="font-bold text-white">
          {riskyAreas.join(", ")}
        </strong>
      </span>
    </div>
  );
}
