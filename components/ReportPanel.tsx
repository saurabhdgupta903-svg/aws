"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { riskLevelLabel, type Translations } from "@/lib/i18n";
import { RISK_COLORS, type RiskLevel } from "@/lib/risk";
import {
  compressImageToThumbnail,
  postSharedReport,
  uploadPhotoToS3,
  type FloodReport,
} from "@/lib/store";
import type { LatLng } from "@/lib/geo";

interface ReportPanelProps {
  userLocation: LatLng | null;
  pickedPin: LatLng | null;
  isPickingOnMap: boolean;
  onStartPickOnMap: () => void;
  onUseGps: () => void;
  reports: FloodReport[];
  reportsLoading: boolean;
  reportsError: string | null;
  reportsTotal: number;
  reportsHasMore: boolean;
  loadingMore: boolean;
  onRetryReports: () => void;
  onLoadMoreReports: () => void;
  onReportCreated: (report: FloodReport) => void;
  onFocusReport: (report: FloodReport) => void;
  t: Translations;
}

export default function ReportPanel({
  userLocation,
  pickedPin,
  isPickingOnMap,
  onStartPickOnMap,
  onUseGps,
  reports,
  reportsLoading,
  reportsError,
  reportsTotal,
  reportsHasMore,
  loadingMore,
  onRetryReports,
  onLoadMoreReports,
  onReportCreated,
  onFocusReport,
  t,
}: ReportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reportType, setReportType] = useState<string>("flood");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FloodReport | null>(null);

  const activeCoords: LatLng =
    pickedPin ?? userLocation ?? { lat: 19.7515, lng: 75.7139 };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setSelectedFile(file);
    try {
      const thumb = await compressImageToThumbnail(file, 150, 20000);
      setPreviewUrl(thumb);
    } catch {
      setErrorMsg("Could not process selected image.");
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile && !note.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      let waterPresent = true;
      let severity: RiskLevel = "medium";
      let reason = note.trim() || "Community flood report.";
      let demoMode = false;
      let photoKey: string | null = null;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("image", selectedFile);

        const res = await fetch("/api/analyze", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Analysis failed (${res.status})`);

        const data = (await res.json()) as {
          waterPresent: boolean;
          severity: RiskLevel;
          reason: string;
          demoMode?: boolean;
        };

        waterPresent = data.waterPresent;
        severity = data.severity;
        reason = note.trim() ? `${note.trim()} — ${data.reason}` : data.reason;
        demoMode = Boolean(data.demoMode);
        photoKey = await uploadPhotoToS3(selectedFile);
      }

      const created = await postSharedReport({
        type: reportType,
        lat: activeCoords.lat,
        lng: activeCoords.lng,
        photoKey: photoKey ?? undefined,
        thumbnail: photoKey ? undefined : (previewUrl ?? undefined),
        waterPresent,
        severity,
        reason,
        description: reason,
        demoMode,
      });

      onReportCreated(created);
      setLastResult(created);
      setSelectedFile(null);
      setPreviewUrl(null);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">{t.reportTitle}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t.reportSubtitle}</p>
        </div>

        {/* Photo Capture / Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          id="flood-photo-input"
        />
        <label
          htmlFor="flood-photo-input"
          className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/35 text-cyan-200 font-semibold text-sm cursor-pointer transition-colors"
        >
          <Camera className="w-5 h-5 text-cyan-400" />
          {t.takeOrUploadPhoto}
        </label>

        {previewUrl && (
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/70 border border-slate-700">
            <img
              src={previewUrl}
              alt="Flood preview"
              className="w-16 h-16 rounded-lg object-cover shrink-0 border border-slate-600"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{selectedFile?.name}</p>
              <p className="text-[11px] text-slate-400">~150px thumbnail ready</p>
            </div>
          </div>
        )}

        {/* Category + Optional Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            aria-label="Report category"
            className="text-xs bg-slate-800/80 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-400"
          >
            <option value="flood">Flood</option>
            <option value="waterlogging">Waterlogging</option>
            <option value="drain_overflow">Drain Overflow</option>
            <option value="landslide">Landslide</option>
            <option value="road_block">Road Block</option>
            <option value="other">Other</option>
          </select>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Brief note (optional with photo)"
            aria-label="Report description"
            className="text-xs bg-slate-800/80 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-400 placeholder:text-slate-500"
          />
        </div>

        {/* Location Controls */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onUseGps}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                !pickedPin
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                  : "bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              {t.useMyGps}
            </button>
            <button
              type="button"
              onClick={onStartPickOnMap}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                isPickingOnMap || pickedPin
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                  : "bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {t.pickOnMap}
            </button>
          </div>

          {isPickingOnMap && (
            <p className="text-xs text-cyan-300 bg-cyan-950/50 border border-cyan-500/30 rounded-lg px-3 py-1.5">
              {t.pickingOnMapHint}
            </p>
          )}

          <p className="text-[11px] text-slate-400">
            {t.selectedCoords}: {activeCoords.lat.toFixed(4)}, {activeCoords.lng.toFixed(4)}
          </p>
        </div>

        <button
          type="button"
          disabled={(!selectedFile && !note.trim()) || submitting}
          onClick={handleSubmit}
          className="w-full py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.analyzingPhoto}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {t.analyzeAndSubmit}
            </>
          )}
        </button>

        {errorMsg && (
          <p className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2">
            {errorMsg}
          </p>
        )}

        {lastResult && (
          <div className="rounded-xl bg-slate-800/90 border border-cyan-500/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase text-slate-950"
                style={{ backgroundColor: RISK_COLORS[lastResult.severity] }}
              >
                {riskLevelLabel(lastResult.severity, t)}
              </span>
              {lastResult.demoMode && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                  {t.demoModeLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-200">{lastResult.description || lastResult.reason}</p>
          </div>
        )}
      </div>

      {/* Shared Community Reports */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold text-slate-300">
            {t.recentReports} ({reportsTotal || reports.length})
          </h3>
          <button
            type="button"
            onClick={onRetryReports}
            disabled={reportsLoading}
            className="text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 disabled:opacity-50"
            title="Refresh reports"
          >
            <RefreshCw className={`w-3 h-3 ${reportsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {reportsLoading && reports.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Loading public reports...
          </div>
        ) : reportsError && reports.length === 0 ? (
          <div className="rounded-xl bg-red-950/30 border border-red-500/30 p-3 text-xs text-red-200 space-y-2">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{reportsError}</span>
            </div>
            <button
              type="button"
              onClick={onRetryReports}
              className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 font-semibold"
            >
              {t.retry}
            </button>
          </div>
        ) : reports.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">{t.noReportsYet}</p>
        ) : (
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {reports.map((rep) => (
              <button
                key={rep.id}
                type="button"
                onClick={() => onFocusReport(rep)}
                className="w-full text-left flex items-start gap-3 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 p-2.5 transition-colors"
              >
                {rep.photoUrl || rep.thumbnail || rep.imageUrl ? (
                  <img
                    src={rep.photoUrl || rep.thumbnail || rep.imageUrl || undefined}
                    alt="Flood report"
                    className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-600"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-700 shrink-0 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-slate-950"
                      style={{ backgroundColor: RISK_COLORS[rep.severity] }}
                    >
                      {riskLevelLabel(rep.severity, t)}
                    </span>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300">
                      {(rep.type ?? "flood").replace("_", " ")}
                    </span>
                    <span
                      className={`text-[10px] font-medium inline-flex items-center gap-1 ${
                        rep.verified ? "text-emerald-300" : "text-amber-300"
                      }`}
                    >
                      {rep.verified && <CheckCircle2 className="w-3 h-3" />}
                      {rep.verified ? t.verifiedBadge : t.unverifiedBadge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 mt-1 line-clamp-2">
                    {rep.description || rep.reason}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {rep.lat.toFixed(3)}, {rep.lng.toFixed(3)} ·{" "}
                    {new Date(rep.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </button>
            ))}

            {reportsHasMore && (
              <button
                type="button"
                onClick={onLoadMoreReports}
                disabled={loadingMore}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 border border-slate-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${reports.length} of ${reportsTotal})`
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
