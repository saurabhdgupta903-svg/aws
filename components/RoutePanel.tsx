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
  type HazardZone,
  type LatLng,
  type PlaceResult,
  type RoutePlanResult,
} from "@/lib/geo";
import type { Translations } from "@/lib/i18n";

type VehicleOption = "bike" | "car" | "bus" | "walk";

interface VehicleRouteItem {
  id: string;
  geometry: [number, number][];
  distanceM: number;
  durationS: number;
  safetyScore: number;
  hazardsOnRoute: {
    count: number;
    nearest: Array<{
      id: string;
      type: string;
      severity: string;
      description: string;
      latitude: number;
      longitude: number;
      distanceM: number;
    }>;
  };
  label: "Safest" | "Fastest" | "Balanced";
  summary: string;
}

interface RoutesApiPayload {
  routes: VehicleRouteItem[];
  vehicle: VehicleOption;
  routingProfileUsed: string;
  profileNote: string | null;
  alternativesNote: string | null;
  noHazardData: boolean;
  error?: string;
}

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

const VEHICLES: Array<{ id: VehicleOption; label: string; icon: React.ReactNode }> = [
  { id: "bike", label: "Bike", icon: <Bike className="w-3.5 h-3.5" /> },
  { id: "car", label: "Car", icon: <Car className="w-3.5 h-3.5" /> },
  { id: "bus", label: "Bus", icon: <Bus className="w-3.5 h-3.5" /> },
  { id: "walk", label: "Walk", icon: <Footprints className="w-3.5 h-3.5" /> },
];

function safetyBadgeColor(score: number): string {
  if (score >= 80) return "bg-emerald-500 text-slate-950";
  if (score >= 55) return "bg-amber-400 text-slate-950";
  return "bg-red-500 text-white";
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
  t,
}: RoutePanelProps) {
  const [vehicle, setVehicle] = useState<VehicleOption>("car");
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
  const [apiMeta, setApiMeta] = useState<{
    routingProfileUsed: string;
    profileNote: string | null;
    alternativesNote: string | null;
    noHazardData: boolean;
  } | null>(null);

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

  const buildRoutePlanResult = (
    routes: VehicleRouteItem[],
    selectedId: string
  ): RoutePlanResult => {
    const chosen = routes.find((r) => r.id === selectedId) ?? routes[0];
    const others = routes.filter((r) => r.id !== chosen.id);
    return {
      selectedRoute: {
        id: chosen.id,
        label: chosen.label,
        coordinates: chosen.geometry,
        distanceM: chosen.distanceM,
        durationS: chosen.durationS,
        intersectedZones: [],
        isSafe: chosen.hazardsOnRoute.count === 0,
      },
      rejectedRoutes: others.map((o) => ({
        id: o.id,
        label: o.label,
        coordinates: o.geometry,
        distanceM: o.distanceM,
        durationS: o.durationS,
        intersectedZones: [],
        isSafe: o.hazardsOnRoute.count === 0,
      })),
      allFlooded: routes.every((r) => r.hazardsOnRoute.count > 0),
      avoidedZonesCount: chosen.hazardsOnRoute.count,
      avoidanceMessage: chosen.summary,
      vehicleRoutes: routes,
      selectedVehicleRouteId: chosen.id,
    };
  };

  const handleFindRoute = async () => {
    if (!destCoords) return;
    setRouting(true);
    setErrorMsg(null);
    try {
      const fromParam = `${effectiveSource.lat},${effectiveSource.lng}`;
      const toParam = `${destCoords.lat},${destCoords.lng}`;
      const res = await fetch(
        `/api/routes?from=${encodeURIComponent(fromParam)}&to=${encodeURIComponent(toParam)}&vehicle=${vehicle}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as RoutesApiPayload;
      if (!res.ok) {
        throw new Error(data.error || `Routing error (${res.status})`);
      }
      if (!data.routes || data.routes.length === 0) {
        throw new Error("No routes returned between these points.");
      }

      setApiMeta({
        routingProfileUsed: data.routingProfileUsed,
        profileNote: data.profileNote,
        alternativesNote: data.alternativesNote,
        noHazardData: data.noHazardData,
      });
      onRouteComputed(buildRoutePlanResult(data.routes, data.routes[0].id));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to compute safe route.");
      onRouteComputed(null);
    } finally {
      setRouting(false);
    }
  };

  const handleSelectRoute = (routeId: string) => {
    if (!routeResult?.vehicleRoutes) return;
    onRouteComputed(buildRoutePlanResult(routeResult.vehicleRoutes, routeId));
  };

  const vehicleRoutes = routeResult?.vehicleRoutes ?? [];
  const selectedId = routeResult?.selectedVehicleRouteId;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Route className="w-5 h-5 text-cyan-400" />
          {t.routeTitle}
        </h2>

        {/* Vehicle Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Vehicle</label>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Vehicle selector">
            {VEHICLES.map((v) => {
              const active = vehicle === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicle(v.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold border transition-colors ${
                    active
                      ? "bg-cyan-500 text-slate-950 border-cyan-400"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-cyan-500/40"
                  }`}
                >
                  {v.icon}
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
          {vehicle === "bus" && (
            <p className="text-[11px] text-slate-400">
              Bus uses a large-vehicle road profile (avoiding narrow lanes), not live public transit.
            </p>
          )}
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

      {/* Route Cards */}
      {vehicleRoutes.length > 0 ? (
        <div className="space-y-2.5">
          {apiMeta?.profileNote && (
            <div className="flex items-start gap-2 rounded-xl bg-slate-900/90 border border-slate-700 p-2.5 text-[11px] text-slate-300">
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
              <span>{apiMeta.profileNote}</span>
            </div>
          )}
          {apiMeta?.alternativesNote && (
            <div className="flex items-start gap-2 rounded-xl bg-slate-900/90 border border-slate-700 p-2.5 text-[11px] text-slate-300">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{apiMeta.alternativesNote}</span>
            </div>
          )}

          {vehicleRoutes.map((rt, idx) => {
            const isSelected = rt.id === selectedId;
            const colorSwatches = ["bg-emerald-400", "bg-amber-400", "bg-violet-400"];
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => handleSelectRoute(rt.id)}
                className={`w-full text-left rounded-2xl border p-3.5 transition-all space-y-2 ${
                  isSelected
                    ? "bg-slate-800/95 border-cyan-400 shadow-lg shadow-cyan-950/30"
                    : "bg-slate-900/70 border-slate-800 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${colorSwatches[idx % colorSwatches.length]}`} />
                    <span className="text-xs font-bold text-white uppercase tracking-wide">
                      {rt.label}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${safetyBadgeColor(
                      rt.safetyScore
                    )}`}
                  >
                    Safety {rt.safetyScore}/100
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-900/80 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">{t.etaLabel}</span>
                    <span className="font-bold text-white">
                      {Math.max(1, Math.round(rt.durationS / 60))} min
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">{t.distanceLabel}</span>
                    <span className="font-bold text-white">
                      {(rt.distanceM / 1000).toFixed(1)} km
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-900/80 px-2.5 py-1.5">
                    <span className="text-[10px] text-slate-400 block">Hazards</span>
                    <span
                      className={`font-bold ${
                        rt.hazardsOnRoute.count > 0 ? "text-amber-300" : "text-emerald-400"
                      }`}
                    >
                      {rt.hazardsOnRoute.count}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-300">{rt.summary}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-4 text-xs text-slate-400 text-center">
          {t.noRouteYet}
        </div>
      )}
    </div>
  );
}
