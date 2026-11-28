"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bike,
  Bus,
  Car,
  Footprints,
  Info,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  searchMaharashtraPlaces,
  type LatLng,
  type PlaceResult,
} from "@/lib/geo";
import type { Translations } from "@/lib/i18n";
import type { RouteLabel, SafeRoute, SafeRoutesResponse, Vehicle } from "@/lib/safeRoutes";

export const ROUTE_COLORS = ["#22c55e", "#3b82f6", "#a855f7"] as const;

interface RoutePanelProps {
  userLocation: LatLng | null;
  sourceCoords: LatLng | null;
  destCoords: LatLng | null;
  destLabel: string;
  onChangeSource: (coords: LatLng | null) => void;
  onChangeDest: (coords: LatLng | null, label: string) => void;
  pickMode: "source" | "destination" | null;
  onSetPickMode: (mode: "source" | "destination" | null) => void;
  routeResult: SafeRoutesResponse | null;
  onRouteComputed: (result: SafeRoutesResponse | null) => void;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  t: Translations;
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 70) {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  }
  if (score >= 40) {
    return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  }
  return "bg-red-500/15 text-red-300 border-red-500/40";
}

function getLabelBadgeClasses(label: RouteLabel): string {
  switch (label) {
    case "Safest":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "Fastest":
      return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    default:
      return "bg-purple-500/20 text-purple-300 border-purple-500/40";
  }
}

export default function RoutePanel({
  userLocation,
  sourceCoords,
  destCoords,
  destLabel,
  onChangeSource,
  onChangeDest,
  pickMode,
  onSetPickMode,
  routeResult,
  onRouteComputed,
  selectedRouteId,
  onSelectRoute,
  t,
}: RoutePanelProps) {
  const [vehicle, setVehicle] = useState<Vehicle>("car");
  const [query, setQuery] = useState(destLabel);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setQuery(destLabel);
  }, [destLabel]);

  // Debounced Maharashtra place search (600ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === destLabel) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchMaharashtraPlaces(trimmed);
        if (!cancelled) setSuggestions(results);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, destLabel]);

  const effectiveSource: LatLng =
    sourceCoords ?? userLocation ?? { lat: 19.7515, lng: 75.7139 };

  const handleFindRoute = async (overrideVehicle?: Vehicle) => {
    if (!destCoords) return;
    const activeVehicle = overrideVehicle ?? vehicle;
    setRouting(true);
    setErrorMsg(null);
    try {
      const fromStr = `${effectiveSource.lat},${effectiveSource.lng}`;
      const toStr = `${destCoords.lat},${destCoords.lng}`;
      const res = await fetch(
        `/api/routes?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&vehicle=${encodeURIComponent(activeVehicle)}`
      );
      const data = (await res.json().catch(() => ({}))) as SafeRoutesResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Route service error (${res.status})`);
      }
      onRouteComputed(data);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to compute safe routes."
      );
      onRouteComputed(null);
    } finally {
      setRouting(false);
    }
  };

  const vehicleOptions: Array<{
    id: Vehicle;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "bike", label: t.vehicleBike, icon: <Bike className="w-4 h-4" /> },
    { id: "car", label: t.vehicleCar, icon: <Car className="w-4 h-4" /> },
    { id: "bus", label: t.vehicleBus, icon: <Bus className="w-4 h-4" /> },
    { id: "walk", label: t.vehicleWalk, icon: <Footprints className="w-4 h-4" /> },
  ];

  const selectedRoute: SafeRoute | undefined =
    routeResult?.routes.find((r) => r.id === selectedRouteId) ??
    routeResult?.routes[0];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Route className="w-5 h-5 text-cyan-400" />
          {t.routeTitle}
        </h2>

        {/* Vehicle Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">
            {t.selectVehicle}
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {vehicleOptions.map((opt) => {
              const active = vehicle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setVehicle(opt.id);
                    if (destCoords) {
                      void handleFindRoute(opt.id);
                    }
                  }}
                  aria-pressed={active}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1.5 rounded-xl text-xs font-semibold border transition-colors min-h-[42px] ${
                    active
                      ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-cyan-500/50 hover:text-white"
                  }`}
                >
                  {opt.icon}
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Source */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">{t.sourceLabel}</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2.5 text-xs text-slate-200 flex items-center gap-2 truncate">
              <Navigation className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">
                {sourceCoords
                  ? `${sourceCoords.lat.toFixed(4)}, ${sourceCoords.lng.toFixed(4)}`
                  : t.myCurrentLocation}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSetPickMode(pickMode === "source" ? null : "source")}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border shrink-0 transition-colors ${
                pickMode === "source"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400"
                  : "bg-slate-800 text-slate-200 border-slate-700 hover:border-cyan-500/50"
              }`}
            >
              {t.pickSourceOnMap}
            </button>
            {sourceCoords && (
              <button
                type="button"
                onClick={() => onChangeSource(null)}
                className="px-2.5 py-2.5 rounded-xl text-xs bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
                title="Reset to GPS"
              >
                GPS
              </button>
            )}
          </div>
        </div>

        {/* Destination */}
        <div className="space-y-1.5 relative">
          <label className="text-xs font-medium text-slate-300">{t.destinationLabel}</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchDestinationPlaceholder}
                className="w-full rounded-xl bg-slate-800/90 border border-slate-700 focus:border-cyan-400 focus:outline-none pl-9 pr-8 py-2.5 text-xs text-white placeholder:text-slate-500"
              />
              {searching && (
                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
            <button
              type="button"
              onClick={() => onSetPickMode(pickMode === "destination" ? null : "destination")}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border shrink-0 transition-colors ${
                pickMode === "destination"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400"
                  : "bg-slate-800 text-slate-200 border-slate-700 hover:border-cyan-500/50"
              }`}
            >
              <MapPin className="w-3.5 h-3.5 inline mr-1" />
              {t.pickDestOnMap}
            </button>
          </div>

          {suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl bg-slate-900 border border-slate-700 shadow-xl max-h-44 overflow-y-auto divide-y divide-slate-800">
              {suggestions.map((place, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeDest(
                        { lat: place.lat, lng: place.lng },
                        place.displayName.split(",")[0]
                      );
                      setSuggestions([]);
                    }}
                    className="w-full text-left px-3 py-2.5 text-xs text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    {place.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          disabled={!destCoords || routing}
          onClick={() => void handleFindRoute()}
          className="w-full py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {routing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.findingRoute}
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              {t.findSafeRoute}
            </>
          )}
        </button>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-xl bg-red-950/40 border border-red-500/30 p-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-200">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void handleFindRoute()}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 font-semibold hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                {t.retry}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bus Disclaimer */}
      {(vehicle === "bus" || routeResult?.bus_disclaimer) && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-950/40 border border-amber-500/30 p-3 text-xs text-amber-200">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{routeResult?.bus_disclaimer ?? t.busDisclaimer}</span>
        </div>
      )}

      {/* Route Cards */}
      {routeResult && routeResult.routes.length > 0 ? (
        <div className="space-y-2.5">
          {routeResult.routes.map((route, idx) => {
            const isSelected = route.id === selectedRoute?.id;
            const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            const etaMin = Math.max(1, Math.round(route.duration_s / 60));
            const distKm = (route.distance_m / 1000).toFixed(1);

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(route.id)}
                className={`w-full text-left rounded-2xl p-3.5 border transition-all space-y-2 ${
                  isSelected
                    ? "bg-slate-900 border-cyan-400 shadow-md shadow-cyan-950/40"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getLabelBadgeClasses(
                        route.label
                      )}`}
                    >
                      {route.label}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getScoreBadgeClasses(
                      route.safety_score
                    )}`}
                  >
                    {t.safetyScoreLabel}: {route.safety_score}/100
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-slate-400">{t.etaLabel}</p>
                    <p className="font-bold text-white">{etaMin} min</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t.distanceLabel}</p>
                    <p className="font-bold text-white">{distKm} km</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t.hazardsNearby}</p>
                    <p
                      className={`font-bold ${
                        route.hazards_on_route.count > 0
                          ? "text-amber-300"
                          : "text-emerald-300"
                      }`}
                    >
                      {route.hazards_on_route.count}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300 leading-snug">
                  {route.summary}
                </p>
              </button>
            );
          })}
        </div>
      ) : routeResult && routeResult.routes.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-4 text-xs text-slate-400 text-center">
          No routes found between these points.
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-4 text-xs text-slate-400 text-center">
          {t.noRouteYet}
        </div>
      )}
    </div>
  );
}
