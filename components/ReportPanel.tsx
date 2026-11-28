"use client";

import { useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
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
  reportsLoading?: boolean;
  reportsError?: string | null;
  onRefreshReports?: () => void;
  onReportsUpdated: (reports: FloodReport[]) => void;
  t: Translations;
}

const REPORT_TYPES = [
  { value: "waterlogging", label: "Waterlogging" },
  { value: "river_flood", label: "River Flood" },
  { value: "landslide", label: "Landslide" },
  { value: "road_block", label: "Road Block" },
  { value: "other", label: "Other" },
] as const;

const SEVERITIES: RiskLevel[] = ["low", "medium", "high", "severe"];

export default function ReportPanel({
  userLocation,
  pickedPin,
  isPickingOnMap,
  onStartPickOnMap,
  onUseGps,
  reports,
  reportsLoading = false,
  reportsError = null,
  onRefreshReports,
  onReportsUpdated,
  t,
}: ReportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [reportType, setReportType] = useState<string>("waterlogging");
  const [severity, setSeverity] = useState<RiskLevel>("medium");
  const [description, setDescription] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

  const canSubmit = !submitting && (Boolean(selectedFile) || description.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      let finalSeverity: RiskLevel = severity;
      let finalReason = description.trim();
      let waterPresent = true;
      let demoMode = false;
      let photoKey: string | undefined;
      let thumbnail: string | undefined;

      if (selectedFile && previewUrl) {
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

        finalSeverity = data.severity;
        finalReason = finalReason || data.reason;
        waterPresent = data.waterPresent;
        demoMode = Boolean(data.demoMode);
        photoKey = (await uploadPhotoToS3(selectedFile)) ?? undefined;
        thumbnail = photoKey ? undefined : previewUrl;
      }

      const updated = await postSharedReport({
        type: reportType,
        description: finalReason,
        lat: activeCoords.lat,
        lng: activeCoords.lng,
        photoKey,
        thumbnail,
        waterPresent,
        severity: finalSeverity,
        reason: finalReason,
        demoMode,
      });

      onReportsUpdated(updated);
      setLastResult(updated[0] ?? null);
      setDescription("");
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3"
      >
        <div>
          <h2 className="text-base font-semibold text-white">{t.reportTitle}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t.reportSubtitle}</p>
        </div>

        {/* Category & Severity */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="report-type" className="block text-[11px] font-medium text-slate-400 mb-1">
              Type
            </label>
            <select
              id="report-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full rounded-xl bg-slate-800/90 border border-slate-700 px-2.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
            >
              {REPORT_TYPES.map((rt) => (
                <option key={rt.value} value={rt.value}>
                  {rt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-severity" className="block text-[11px] font-medium text-slate-400 mb-1">
              Severity
            </label>
            <select
              id="report-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as RiskLevel)}
              className="w-full rounded-xl bg-slate-800/90 border border-slate-700 px-2.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
            >
              {SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {riskLevelLabel(sev, t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="report-desc" className="block text-[11px] font-medium text-slate-400 mb-1">
            Description (required if no photo)
          </label>
          <textarea
            id="report-desc"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe water depth, road condition, or landmark..."
            className="w-full rounded-xl bg-slate-800/90 border border-slate-700 focus:border-cyan-400 focus:outline-none px-3 py-2 text-xs text-white placeholder:text-slate-500 resize-none"
          />
        </div>

        {/* Optional Photo Capture / Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          id="flood-photo-input"
        />
        <label
          htmlFor="flood-photo-input"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/35 text-cyan-200 font-semibold text-xs cursor-pointer transition-colors"
        >
          <Camera className="w-4 h-4 text-cyan-400" />
          {t.takeOrUploadPhoto} (Optional)
        </label>

        {previewUrl && (
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/70 border border-slate-700">
            <img
              src={previewUrl}
              alt="Flood preview"
              className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-600"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{selectedFile?.name}</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-[11px] text-red-300 hover:underline mt-0.5"
              >
                Remove photo
              </button>
            </div>
          </div>
        )}

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
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {selectedFile ? t.analyzingPhoto : "Submitting..."}
            </>
          ) : selectedFile ? (
            <>
              <Sparkles className="w-4 h-4" />
              {t.analyzeAndSubmit}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit Public Report
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
      </form>

      {/* Shared Community Reports */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-300">
            {t.recentReports} ({reports.length})
          </h3>
          {onRefreshReports && (
            <button
              type="button"
              onClick={onRefreshReports}
              disabled={reportsLoading}
              className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
              aria-label="Refresh reports"
            >
              <RefreshCw className={`w-3 h-3 ${reportsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>

        {reportsError && (
          <div className="mb-2 text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2">
            {reportsError}
          </div>
        )}

        {reportsLoading && reports.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Loading community reports...
          </div>
        ) : reports.length === 0 ? (
          <p className="text-xs text-slate-500">{t.noReportsYet}</p>
        ) : (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {reports.map((rep) => (
              <div
                key={rep.id}
                className="flex items-start gap-3 rounded-xl bg-slate-800/70 border border-slate-700/60 p-2.5"
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300 capitalize">
                      {(rep.type || "waterlogging").replace("_", " ")}
                    </span>
                    <span
                      className={`text-[10px] font-medium inline-flex items-center gap-1 ${
                        rep.verified ? "text-emerald-300" : "text-amber-300"
                      }`}
                    >
                      {rep.verified && <CheckCircle2 className="w-3 h-3" />}
                      {rep.status === "resolved" ? "Resolved" : rep.verified ? t.verifiedBadge : t.unverifiedBadge}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
