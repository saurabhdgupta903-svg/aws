"use client";

import { useMemo } from "react";
import L from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { STATE_BOUNDS, STATE_CENTER } from "@/lib/hotspots";
import { hazardTypeLabel, hotspotDisplayName, riskLevelLabel, type Lang, type Translations } from "@/lib/i18n";
import { RISK_COLORS, type HotspotRisk } from "@/lib/risk";
import type { FloodReport } from "@/lib/store";
import type { LatLng, RoutePlanResult } from "@/lib/geo";

interface MapViewProps {
  hotspotRisks: HotspotRisk[];
  userLocation: LatLng | null;
  reports: FloodReport[];
  reportPin: LatLng | null;
  routeSource: LatLng | null;
  routeDest: LatLng | null;
  routeResult: RoutePlanResult | null;
  mapPickMode: "report" | "source" | "destination" | null;
  flyTarget: { lat: number; lng: number; zoom: number } | null;
  currentZoom: number;
  onMapClick: (coords: LatLng) => void;
  onZoomChange: (zoom: number) => void;
  lang: Lang;
  t: Translations;
}

function createPinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: "floodloop-div-icon",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${color};border:2.5px solid #ffffff;color:#020617;font-weight:900;font-size:11px;box-shadow:0 2px 10px rgba(0,0,0,0.5);">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function MapController({
  flyTarget,
  onZoomChange,
}: {
  flyTarget: { lat: number; lng: number; zoom: number } | null;
  onZoomChange: (z: number) => void;
}) {
  const map = useMap();

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  useMemo(() => {
    if (flyTarget) {
      map.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom, { duration: 1.2 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTarget]);

  return null;
}

function MapClickListener({
  enabled,
  onMapClick,
}: {
  enabled: boolean;
  onMapClick: (coords: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Group hotspot risks by city for cluster circles when zoomed out */
function groupByCity(hotspotRisks: HotspotRisk[]): Array<{
  city: string;
  lat: number;
  lng: number;
  count: number;
  worstLevel: HotspotRisk["level"];
  worstScore: number;
}> {
  const cityMap = new Map<string, { lats: number[]; lngs: number[]; risks: HotspotRisk[] }>();
  for (const hr of hotspotRisks) {
    const key = hr.hotspot.city;
    if (!cityMap.has(key)) cityMap.set(key, { lats: [], lngs: [], risks: [] });
    const entry = cityMap.get(key)!;
    entry.lats.push(hr.hotspot.lat);
    entry.lngs.push(hr.hotspot.lng);
    entry.risks.push(hr);
  }
  return Array.from(cityMap.entries()).map(([city, { lats, lngs, risks }]) => {
    const worst = risks.reduce((a, b) => (a.score >= b.score ? a : b));
    return {
      city,
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
      count: risks.length,
      worstLevel: worst.level,
      worstScore: worst.score,
    };
  });
}

export default function MapView({
  hotspotRisks,
  userLocation,
  reports,
  reportPin,
  routeSource,
  routeDest,
  routeResult,
  mapPickMode,
  flyTarget,
  currentZoom,
  onMapClick,
  onZoomChange,
  lang,
  t,
}: MapViewProps) {
  const pinIcons = useMemo(() => ({
    low: createPinIcon(RISK_COLORS.low, "!"),
    medium: createPinIcon(RISK_COLORS.medium, "!"),
    high: createPinIcon(RISK_COLORS.high, "!"),
    severe: createPinIcon(RISK_COLORS.severe, "!"),
    src: createPinIcon("#06b6d4", "S"),
    dst: createPinIcon("#a855f7", "D"),
    pin: createPinIcon("#38bdf8", "P"),
  }), []);

  const showClusters = currentZoom < 10;
  const clusters = useMemo(() => groupByCity(hotspotRisks), [hotspotRisks]);

  return (
    <div className="relative w-full h-full min-h-[340px]">
      <MapContainer
        center={STATE_CENTER}
        zoom={7}
        maxBounds={STATE_BOUNDS}
        maxBoundsViscosity={0.85}
        scrollWheelZoom
        className={`w-full h-full z-0 ${mapPickMode ? "cursor-crosshair" : ""}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapController flyTarget={flyTarget} onZoomChange={onZoomChange} />
        <MapClickListener enabled={Boolean(mapPickMode)} onMapClick={onMapClick} />

        {/* City Cluster Circles (zoom < 10) */}
        {showClusters &&
          clusters.map((cluster) => {
            const color = RISK_COLORS[cluster.worstLevel];
            const radius = 8000 + cluster.count * 1500;
            return (
              <Circle
                key={cluster.city}
                center={[cluster.lat, cluster.lng]}
                radius={radius}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.28, weight: 2 }}
              >
                <Popup>
                  <div className="text-xs space-y-1 min-w-[140px]">
                    <p className="font-bold text-slate-900">{cluster.city}</p>
                    <p className="text-slate-700">
                      Hotspots: <strong>{cluster.count}</strong>
                    </p>
                    <p className="text-slate-700">
                      Worst:{" "}
                      <span className="font-bold" style={{ color }}>
                        {riskLevelLabel(cluster.worstLevel, t)} ({cluster.worstScore}/100)
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">{t.zoomInHint}</p>
                  </div>
                </Popup>
              </Circle>
            );
          })}

        {/* Individual Hotspot Circles (zoom >= 10) */}
        {!showClusters &&
          hotspotRisks.map(({ hotspot, level, score, lastUpdated }) => {
            const color = RISK_COLORS[level];
            return (
              <Circle
                key={hotspot.id}
                center={[hotspot.lat, hotspot.lng]}
                radius={hotspot.radiusM}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 2 }}
              >
                <Popup>
                  <div className="text-xs space-y-1 min-w-[170px]">
                    <p className="font-bold text-slate-900">{hotspotDisplayName(hotspot, lang)}</p>
                    <p className="text-slate-600 text-[11px]">{hotspot.city} · {hotspot.region}</p>
                    <p className="text-slate-600 text-[11px]">
                      {hazardTypeLabel(hotspot.hazardType, t)}
                    </p>
                    <p className="text-slate-700">
                      Risk:{" "}
                      <span className="font-bold" style={{ color }}>
                        {riskLevelLabel(level, t)} ({score}/100)
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {t.lastUpdated}:{" "}
                      {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {hotspot.note && (
                      <p className="text-[10px] text-slate-500 italic">{hotspot.note}</p>
                    )}
                  </div>
                </Popup>
              </Circle>
            );
          })}

        {/* User GPS Location */}
        {userLocation && (
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            pathOptions={{ color: "#ffffff", weight: 2.5, fillColor: "#38bdf8", fillOpacity: 1 }}
          >
            <Popup>
              <span className="text-xs font-semibold text-slate-900">{t.yourLocation}</span>
            </Popup>
          </CircleMarker>
        )}

        {/* Flood Reports + 300m Flood Zones */}
        {reports.map((rep) => {
          const color = RISK_COLORS[rep.severity];
          return (
            <div key={rep.id}>
              {rep.verified && (
                <Circle
                  center={[rep.lat, rep.lng]}
                  radius={300}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.22, weight: 1.5, dashArray: "4, 4" }}
                />
              )}
              <Marker position={[rep.lat, rep.lng]} icon={pinIcons[rep.severity]}>
                <Popup>
                  <div className="text-xs space-y-1.5 max-w-[200px]">
                    {(rep.photoUrl || rep.thumbnail || rep.imageUrl) && (
                      <img
                        src={rep.photoUrl || rep.thumbnail || rep.imageUrl || undefined}
                        alt="Reported waterlogging"
                        className="w-full h-24 object-cover rounded-md border border-slate-300"
                      />
                    )}
                    <p className="font-bold text-slate-900">
                      {riskLevelLabel(rep.severity, t)} ·{" "}
                      {(rep.type || "waterlogging").replace("_", " ")}
                    </p>
                    <p className="text-[11px] text-slate-700">
                      {rep.description || rep.reason}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {rep.status === "resolved" ? "Resolved" : "Active"} ·{" "}
                      {new Date(rep.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}

        {/* Manual Report Pin */}
        {reportPin && <Marker position={[reportPin.lat, reportPin.lng]} icon={pinIcons.pin} />}

        {/* Route Pins */}
        {routeSource && <Marker position={[routeSource.lat, routeSource.lng]} icon={pinIcons.src} />}
        {routeDest && <Marker position={[routeDest.lat, routeDest.lng]} icon={pinIcons.dst} />}

        {/* Rejected Flooded Routes (dashed red) */}
        {routeResult?.rejectedRoutes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.coordinates}
            pathOptions={{ color: "#ef4444", weight: 4, opacity: 0.85, dashArray: "8, 8" }}
          />
        ))}

        {/* Safe Route (green, or orange if all flooded) */}
        {routeResult?.selectedRoute && (
          <Polyline
            positions={routeResult.selectedRoute.coordinates}
            pathOptions={{
              color: routeResult.allFlooded ? "#f97316" : "#22c55e",
              weight: 5,
              opacity: 0.95,
            }}
          />
        )}
      </MapContainer>

      {/* Risk Legend */}
      <div className="absolute bottom-3 left-3 z-[400] rounded-xl bg-slate-950/90 backdrop-blur border border-slate-700/80 px-3 py-2 text-[11px] text-slate-200 shadow-lg">
        <p className="font-semibold text-slate-300 mb-1">{t.legendTitle}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {(["low", "medium", "high", "severe"] as const).map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: RISK_COLORS[lvl] }} />
              {riskLevelLabel(lvl, t)}
            </span>
          ))}
        </div>
      </div>

      {/* Pick Mode Banner */}
      {mapPickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] rounded-full bg-cyan-500 text-slate-950 px-4 py-1.5 text-xs font-bold shadow-lg pointer-events-none">
          {t.pickingOnMapHint}
        </div>
      )}
    </div>
  );
}
