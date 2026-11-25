"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Camera, Droplets, Route as RouteIcon, ShieldAlert } from "lucide-react";
import AlertBanner from "@/components/AlertBanner";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PrecautionPanel from "@/components/PrecautionPanel";
import ReportPanel from "@/components/ReportPanel";
import RiskPanel from "@/components/RiskPanel";
import RoutePanel from "@/components/RoutePanel";
import type { HazardZone, LatLng, RoutePlanResult } from "@/lib/geo";
import { MAHARASHTRA_CITIES, SEEDED_HOTSPOTS, type CityQuickJump } from "@/lib/hotspots";
import { I18N, type Lang } from "@/lib/i18n";
import {
  applyRainSimulationToMap,
  computeCityRisk,
  computeHotspotRisk,
  computeStateSummary,
  createFallbackWeather,
  fetchWeatherForHotspots,
  type SimulateRegionOption,
  type WeatherSnapshot,
} from "@/lib/risk";
import { fetchSharedReports, loadOfflineReports, type FloodReport } from "@/lib/store";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[340px] bg-slate-900/90 animate-pulse flex items-center justify-center text-xs text-slate-400">
      Loading Maharashtra Map...
    </div>
  ),
});

type ActiveTab = "risk" | "report" | "route" | "precautions";

export default function HomePage() {
  // ── Language (auto-detect from browser) ────────────────────────────────
  const [lang, setLang] = useState<Lang>("mr");
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("hi")) setLang("hi");
    else if (nav.startsWith("mr") || nav.startsWith("ma")) setLang("mr");
    else setLang("en");
  }, []);
  const t = I18N[lang];

  // ── Tab & UI state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("risk");
  const [simulateRegion, setSimulateRegion] = useState<SimulateRegionOption>("off");

  // ── City selector ───────────────────────────────────────────────────────
  const [selectedCity, setSelectedCity] = useState<CityQuickJump | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState(7);

  const handleCityJump = (city: CityQuickJump | null) => {
    setSelectedCity(city);
    if (city) {
      setFlyTarget({ lat: city.lat, lng: city.lng, zoom: 12 });
    } else {
      setFlyTarget({ lat: 19.7515, lng: 75.7139, zoom: 7 });
    }
  };

  // ── Weather ─────────────────────────────────────────────────────────────
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherSnapshot>>({});
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const loadWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const data = await fetchWeatherForHotspots(SEEDED_HOTSPOTS);
      setWeatherMap(data);
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : "Weather fetch failed");
      // Build fallback map if empty
      setWeatherMap((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const fallback: Record<string, WeatherSnapshot> = {};
        SEEDED_HOTSPOTS.forEach((hs) => { fallback[hs.id] = createFallbackWeather(); });
        return fallback;
      });
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => { loadWeather(); }, [loadWeather]);

  // ── Reports (localStorage hydration + 30s polling) ──────────────────────
  const [reports, setReports] = useState<FloodReport[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Load from offline cache immediately (avoids hydration mismatch)
    setReports(loadOfflineReports());
    // Then fetch shared server reports
    fetchSharedReports().then(setReports).catch(() => {});
    // Poll every 30s for cross-tab shared reports
    pollRef.current = setInterval(() => {
      fetchSharedReports().then(setReports).catch(() => {});
    }, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── GPS location ────────────────────────────────────────────────────────
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setUserLocation({ lat: 19.076, lng: 72.8777 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLocation({ lat: 19.076, lng: 72.8777 }),
      { enableHighAccuracy: false, timeout: 6000 }
    );
  }, []);

  // ── Computed risk ────────────────────────────────────────────────────────
  const effectiveWeatherMap = useMemo(() =>
    applyRainSimulationToMap(weatherMap, SEEDED_HOTSPOTS, simulateRegion),
    [weatherMap, simulateRegion]
  );

  const hotspotRisks = useMemo(() =>
    SEEDED_HOTSPOTS.map((hs) =>
      computeHotspotRisk(hs, effectiveWeatherMap[hs.id] ?? createFallbackWeather(), reports)
    ),
    [effectiveWeatherMap, reports]
  );

  const stateSummary = useMemo(() => computeStateSummary(hotspotRisks), [hotspotRisks]);

  const focusedCityName = selectedCity?.name ?? t.allMaharashtra;
  const focusedCityRisk = useMemo(() =>
    selectedCity
      ? computeCityRisk(hotspotRisks, selectedCity.name)
      : { score: stateSummary.overallScore, level: stateSummary.overallLevel },
    [hotspotRisks, selectedCity, stateSummary]
  );

  // ── Map interaction state ───────────────────────────────────────────────
  const [mapPickMode, setMapPickMode] = useState<"report" | "source" | "destination" | null>(null);
  const [reportPin, setReportPin] = useState<LatLng | null>(null);
  const [routeSource, setRouteSource] = useState<LatLng | null>(null);
  const [routeDest, setRouteDest] = useState<LatLng | null>(null);
  const [routeDestLabel, setRouteDestLabel] = useState("");
  const [routeResult, setRouteResult] = useState<RoutePlanResult | null>(null);

  const handleMapClick = (coords: LatLng) => {
    if (mapPickMode === "report") { setReportPin(coords); setMapPickMode(null); }
    else if (mapPickMode === "source") { setRouteSource(coords); setMapPickMode(null); }
    else if (mapPickMode === "destination") {
      setRouteDest(coords);
      setRouteDestLabel(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      setMapPickMode(null);
    }
  };

  // ── Hazard zones for routing ─────────────────────────────────────────────
  const hazardZones: HazardZone[] = useMemo(() => {
    const hotspotZones: HazardZone[] = hotspotRisks.map((hr) => ({
      id: hr.hotspot.id,
      name: hr.hotspot.name,
      lat: hr.hotspot.lat,
      lng: hr.hotspot.lng,
      radiusM: hr.hotspot.radiusM,
      severity: hr.level,
      hazardType: hr.hotspot.hazardType,
    }));
    const reportZones: HazardZone[] = reports
      .filter((r) => r.verified)
      .map((r) => ({
        id: r.id,
        name: "Reported Flood Zone",
        lat: r.lat,
        lng: r.lng,
        radiusM: 300,
        severity: r.severity,
        hazardType: "reported_flood" as const,
      }));
    return [...hotspotZones, ...reportZones];
  }, [hotspotRisks, reports]);

  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: "risk", label: t.tabRisk, icon: <AlertTriangle className="w-4 h-4" /> },
    { id: "report", label: t.tabReport, icon: <Camera className="w-4 h-4" /> },
    { id: "route", label: t.tabRoute, icon: <RouteIcon className="w-4 h-4" /> },
    { id: "precautions", label: t.tabPrecautions, icon: <ShieldAlert className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#071022] text-slate-100">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#071022]/95 backdrop-blur border-b border-cyan-500/20 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shrink-0">
            <Droplets className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">{t.appName}</h1>
            <p className="text-[10px] text-cyan-300/70 truncate hidden sm:block">{t.tagline}</p>
          </div>
        </div>

        {/* City Quick-Jump + Language Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedCity?.name ?? ""}
            onChange={(e) => {
              const city = MAHARASHTRA_CITIES.find((c) => c.name === e.target.value) ?? null;
              handleCityJump(city);
            }}
            className="text-xs bg-slate-900/90 border border-cyan-500/25 text-slate-200 rounded-xl px-2.5 py-1.5 max-w-[130px] sm:max-w-[180px] focus:outline-none focus:border-cyan-400"
          >
            <option value="">{t.allMaharashtra}</option>
            {MAHARASHTRA_CITIES.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>
      </header>

      {/* ── Alert Banner ─────────────────────────────────────────────────── */}
      <AlertBanner
        cityLevel={focusedCityRisk.level}
        hotspotRisks={hotspotRisks}
        lang={lang}
        t={t}
      />

      {/* ── Main Layout ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map */}
        <section className="w-full h-[44vh] min-h-[320px] lg:h-[calc(100vh-56px)] lg:flex-1 relative border-b lg:border-b-0 lg:border-r border-slate-800">
          <MapView
            hotspotRisks={hotspotRisks}
            userLocation={userLocation}
            reports={reports}
            reportPin={reportPin}
            routeSource={routeSource ?? userLocation}
            routeDest={routeDest}
            routeResult={routeResult}
            mapPickMode={mapPickMode}
            flyTarget={flyTarget}
            currentZoom={currentZoom}
            onMapClick={handleMapClick}
            onZoomChange={setCurrentZoom}
            lang={lang}
            t={t}
          />
        </section>

        {/* Panel */}
        <aside className="w-full lg:w-[430px] xl:w-[460px] flex flex-col bg-[#09142a] lg:h-[calc(100vh-56px)]">
          {/* Tabs */}
          <nav aria-label="Feature tabs" className="grid grid-cols-4 gap-1 p-2 bg-[#071022] border-b border-slate-800 shrink-0">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setMapPickMode(null); }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2.5 px-1 rounded-xl text-xs font-semibold transition-all min-h-[44px] ${
                    active
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50"
                      : "bg-slate-900/70 text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "risk" && (
              <RiskPanel
                stateSummary={stateSummary}
                focusedCityRisk={focusedCityRisk}
                focusedCity={focusedCityName}
                hotspotRisks={hotspotRisks}
                weatherMap={effectiveWeatherMap}
                weatherLoading={weatherLoading}
                weatherError={weatherError}
                onRetryWeather={loadWeather}
                simulateRegion={simulateRegion}
                onChangeSimulateRegion={setSimulateRegion}
                lang={lang}
                t={t}
              />
            )}

            {activeTab === "report" && (
              <ReportPanel
                userLocation={userLocation}
                pickedPin={reportPin}
                isPickingOnMap={mapPickMode === "report"}
                onStartPickOnMap={() => setMapPickMode(mapPickMode === "report" ? null : "report")}
                onUseGps={() => { setReportPin(null); setMapPickMode(null); }}
                reports={reports}
                onReportsUpdated={setReports}
                t={t}
              />
            )}

            {activeTab === "route" && (
              <RoutePanel
                userLocation={userLocation}
                sourceCoords={routeSource}
                destCoords={routeDest}
                destLabel={routeDestLabel}
                onChangeSource={setRouteSource}
                onChangeDest={(coords, label) => { setRouteDest(coords); setRouteDestLabel(label); }}
                pickMode={mapPickMode === "source" || mapPickMode === "destination" ? mapPickMode : null}
                onSetPickMode={(mode) => setMapPickMode(mode)}
                hazardZones={hazardZones}
                routeResult={routeResult}
                onRouteComputed={setRouteResult}
                t={t}
              />
            )}

            {activeTab === "precautions" && (
              <PrecautionPanel cityLevel={focusedCityRisk.level} t={t} />
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
