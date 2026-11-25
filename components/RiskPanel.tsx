"use client";

import { CloudRain, Droplets, Mountain, RefreshCw, Waves, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { hazardTypeLabel, hotspotDisplayName, riskLevelLabel, type Lang, type Translations } from "@/lib/i18n";
import {
  RISK_COLORS,
  type HotspotRisk,
  type RiskLevel,
  type SimulateRegionOption,
  type StateRiskSummary,
  type WeatherSnapshot,
} from "@/lib/risk";
import { REGIONS } from "@/lib/hotspots";

interface RiskPanelProps {
  stateSummary: StateRiskSummary;
  focusedCityRisk: { score: number; level: RiskLevel };
  focusedCity: string;
  hotspotRisks: HotspotRisk[];
  weatherMap: Record<string, WeatherSnapshot>;
  weatherLoading: boolean;
  weatherError: string | null;
  onRetryWeather: () => void;
  simulateRegion: SimulateRegionOption;
  onChangeSimulateRegion: (region: SimulateRegionOption) => void;
  lang: Lang;
  t: Translations;
}

function HazardIcon({ type }: { type: string }) {
  if (type === "river_flood") return <Waves className="w-3 h-3 text-sky-400" />;
  if (type === "ghat_landslide") return <Mountain className="w-3 h-3 text-amber-400" />;
  return <Droplets className="w-3 h-3 text-cyan-400" />;
}

export default function RiskPanel({
  stateSummary,
  focusedCityRisk,
  focusedCity,
  hotspotRisks,
  weatherMap,
  weatherLoading,
  weatherError,
  onRetryWeather,
  simulateRegion,
  onChangeSimulateRegion,
  lang,
  t,
}: RiskPanelProps) {
  const isSimulating = simulateRegion !== "off";

  // Show chart from first hotspot with weather data
  const firstHotspot = stateSummary.top5[0];
  const chartWeather: WeatherSnapshot | null = firstHotspot
    ? (weatherMap[firstHotspot.hotspot.id] ?? null)
    : null;

  return (
    <div className="space-y-4">
      {/* Simulate Rain Region Selector */}
      <div
        className={`rounded-2xl border p-4 ${
          isSimulating
            ? "bg-cyan-500/10 border-cyan-400"
            : "bg-slate-900/90 border-slate-700"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap className={`w-4 h-4 ${isSimulating ? "text-cyan-300" : "text-slate-400"}`} />
          <span className={`text-sm font-semibold ${isSimulating ? "text-cyan-200" : "text-slate-200"}`}>
            {t.simulateRainInLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChangeSimulateRegion("off")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              simulateRegion === "off"
                ? "bg-cyan-500 text-slate-950 border-cyan-400"
                : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500"
            }`}
          >
            {t.simulateOff}
          </button>
          <button
            type="button"
            onClick={() => onChangeSimulateRegion("All")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              simulateRegion === "All"
                ? "bg-cyan-500 text-slate-950 border-cyan-400"
                : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500"
            }`}
          >
            {t.simulateAllRegions}
          </button>
          {REGIONS.map((region) => (
            <button
              key={region}
              type="button"
              onClick={() => onChangeSimulateRegion(region)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                simulateRegion === region
                  ? "bg-cyan-500 text-slate-950 border-cyan-400"
                  : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500"
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      {/* Maharashtra Flood Watch — Statewide Summary */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">{t.stateWatchTitle}</h2>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-slate-950"
            style={{ backgroundColor: RISK_COLORS[stateSummary.overallLevel] }}
          >
            {riskLevelLabel(stateSummary.overallLevel, t)}
          </span>
        </div>

        {/* Counts bar */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {(["low", "medium", "high", "severe"] as RiskLevel[]).map((lvl) => (
            <div
              key={lvl}
              className="flex flex-col items-center rounded-xl py-2 px-1"
              style={{ backgroundColor: RISK_COLORS[lvl] + "22", border: `1px solid ${RISK_COLORS[lvl]}44` }}
            >
              <span className="text-lg font-bold text-white">{stateSummary.counts[lvl]}</span>
              <span className="text-[10px] font-medium mt-0.5" style={{ color: RISK_COLORS[lvl] }}>
                {riskLevelLabel(lvl, t)}
              </span>
            </div>
          ))}
        </div>

        {weatherError && (
          <div className="flex items-center justify-between text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-2">
            <span>{t.weatherError}</span>
            <button
              type="button"
              onClick={onRetryWeather}
              className="inline-flex items-center gap-1 text-cyan-300 font-semibold hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              {t.retry}
            </button>
          </div>
        )}
      </div>

      {/* Regional Breakdown */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">{t.regionalBreakdownTitle}</h3>
        <div className="space-y-2">
          {stateSummary.regionalBreakdown.filter(r => r.total > 0).map((rb) => (
            <div key={rb.region} className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 w-28 shrink-0 truncate">{rb.region}</span>
              <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden flex">
                {(["severe", "high", "medium", "low"] as RiskLevel[]).map((lvl) => {
                  const pct = rb.total > 0 ? (rb[lvl] / rb.total) * 100 : 0;
                  return pct > 0 ? (
                    <div
                      key={lvl}
                      style={{ width: `${pct}%`, backgroundColor: RISK_COLORS[lvl] }}
                    />
                  ) : null;
                })}
              </div>
              <span
                className="text-[10px] font-bold w-14 text-right shrink-0"
                style={{ color: RISK_COLORS[rb.worstLevel] }}
              >
                {rb.worstScore}/100
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Focused City Risk */}
      {focusedCity !== t.allMaharashtra && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
          <p className="text-xs text-slate-400">{t.cityRiskTitle}: <span className="font-semibold text-white">{focusedCity}</span></p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-white">{focusedCityRisk.score}</span>
            <span className="text-xs text-slate-400">/ 100</span>
            <span
              className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide text-slate-950"
              style={{ backgroundColor: RISK_COLORS[focusedCityRisk.level] }}
            >
              {riskLevelLabel(focusedCityRisk.level, t)}
            </span>
          </div>

          {/* Weather stats for focused city best hotspot */}
          {weatherLoading && !chartWeather ? (
            <div className="grid grid-cols-3 gap-2 mt-3 animate-pulse">
              <div className="h-14 rounded-xl bg-slate-800" />
              <div className="h-14 rounded-xl bg-slate-800" />
              <div className="h-14 rounded-xl bg-slate-800" />
            </div>
          ) : chartWeather ? (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <CloudRain className="w-3 h-3 text-cyan-400" />
                  {t.currentRain}
                </p>
                <p className="text-sm font-bold text-white mt-1">{chartWeather.currentRainMm} mm/h</p>
              </div>
              <div className="rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-cyan-400" />
                  {t.next6hRain}
                </p>
                <p className="text-sm font-bold text-white mt-1">{chartWeather.next6hRainTotalMm} mm</p>
              </div>
              <div className="rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60">
                <p className="text-[11px] text-slate-400">{t.precipProb}</p>
                <p className="text-sm font-bold text-white mt-1">{chartWeather.maxNext6hProbPct}%</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* 6-Hour Forecast Chart */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">
          {t.forecastChartTitle}
          {firstHotspot && (
            <span className="text-slate-500 ml-1">
              ({hotspotDisplayName(firstHotspot.hotspot, lang)})
            </span>
          )}
        </h3>
        {weatherLoading && !chartWeather ? (
          <div className="h-32 rounded-xl bg-slate-800 animate-pulse" />
        ) : chartWeather && chartWeather.hourly6h.length > 0 ? (
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartWeather.hourly6h}>
                <XAxis dataKey="timeLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "12px", fontSize: "12px", color: "#f8fafc" }}
                />
                <Bar dataKey="precipitationMm" name="mm" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t.weatherLoading}</p>
        )}
      </div>

      {/* Top 5 Riskiest Areas Statewide */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <h3 className="text-xs font-semibold text-slate-300 mb-3">{t.topRiskiestAreas}</h3>
        <div className="space-y-2">
          {stateSummary.top5.map((item) => (
            <div
              key={item.hotspot.id}
              className="flex items-center justify-between rounded-xl bg-slate-800/70 border border-slate-700/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <HazardIcon type={item.hotspot.hazardType} />
                  <p className="text-sm font-medium text-white truncate">
                    {hotspotDisplayName(item.hotspot, lang)}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400">{item.hotspot.city} · {item.hotspot.region}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase text-slate-950 block mb-0.5"
                  style={{ backgroundColor: RISK_COLORS[item.level] }}
                >
                  {riskLevelLabel(item.level, t)}
                </span>
                <span className="text-[11px] text-slate-400">{item.score}/100</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
