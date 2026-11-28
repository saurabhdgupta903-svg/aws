"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  planSafeRoute,
  searchMaharashtraPlaces,
  type HazardZone,
  type LatLng,
  type PlaceResult,
  type RoutePlanResult,
} from "@/lib/geo";
import type { Translations } from "@/lib/i18n";

interface RoutePanelProps {
  userLocation: LatLng | null;
  sourceCoords: LatLng | null;
  destCoords: LatLng | null;
  destLabel: string;
  onChangeSource: (coords: LatLng | null) => void;
  onChangeDest: (coords: LatLng | null, label: string) => void;
  pickMode: "source" | "destination" | null;
  onSetPickMode: (mode: "source" | "destination" | null) => void;
  hazardZones: HazardZone[];
  routeResult: RoutePlanResult | null;
  onRouteComputed: (result: RoutePlanResult | null) => void;
  t: Translations;
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
  hazardZones,
  routeResult,
  onRouteComputed,
  t,
}: RoutePanelProps) {
  const [query, setQuery] = useState(destLabel);
  const [prevDestLabel, setPrevDestLabel] = useState(destLabel);
  if (destLabel !== prevDestLabel) {
    setPrevDestLabel(destLabel);
    setQuery(destLabel);
  }
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounced Maharashtra place search (600ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === destLabel) {
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

  const handleFindRoute = async () => {
    if (!destCoords) return;
    setRouting(true);
    setErrorMsg(null);
    try {
      const result = await planSafeRoute(effectiveSource, destCoords, hazardZones);
      onRouteComputed(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to compute safe route.");
      onRouteComputed(null);
    } finally {
      setRouting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Route className="w-5 h-5 text-cyan-400" />
          {t.routeTitle}
        </h2>

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
          onClick={handleFindRoute}
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
                onClick={handleFindRoute}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 font-semibold hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                {t.retry}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Route Result */}
      {routeResult ? (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
          {routeResult.allFlooded && (
            <div className="flex items-start gap-2 rounded-xl bg-red-950/60 border border-red-500/40 p-3 text-xs text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{t.allRoutesFloodedWarning}</span>
            </div>
          )}

          {routeResult.avoidanceMessage && (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-950/50 border border-emerald-500/40 p-3 text-xs text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{routeResult.avoidanceMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60">
              <p className="text-[11px] text-slate-400">{t.distanceLabel}</p>
              <p className="text-sm font-bold text-white mt-0.5">
                {(routeResult.selectedRoute.distanceM / 1000).toFixed(1)} km
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60">
              <p className="text-[11px] text-slate-400">{t.etaLabel}</p>
              <p className="text-sm font-bold text-white mt-0.5">
                {Math.max(1, Math.round(routeResult.selectedRoute.durationS / 60))} min
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60">
              <p className="text-[11px] text-slate-400">{t.avoidedCountLabel}</p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">
                {routeResult.avoidedZonesCount}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-4 text-xs text-slate-400 text-center">
          {t.noRouteYet}
        </div>
      )}
    </div>
  );
}
