import { haversineMeters } from "./geo";
import type { RiskLevel } from "./risk";

export interface FloodReport {
  id: string;
  type?: string;
  description?: string;
  status?: "active" | "resolved";
  imageUrl?: string | null;
  lat: number;
  lng: number;
  photoKey?: string;
  photoUrl?: string; // Presigned S3 GET URL
  thumbnail?: string; // Fallback thumbnail for local/offline mode
  waterPresent: boolean;
  severity: RiskLevel;
  reason: string;
  verified: boolean;
  demoMode?: boolean;
  createdAt: string;
}

const OFFLINE_CACHE_KEY = "floodloop_reports_cache_v3";
const VERIFICATION_RADIUS_M = 300;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function recomputeVerifications(reports: FloodReport[]): FloodReport[] {
  const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
  const active = reports.filter(
    (r) => new Date(r.createdAt).getTime() >= cutoff
  );

  return active.map((report) => {
    if (report.waterPresent) {
      return { ...report, verified: true };
    }
    const nearbyCount = active.filter(
      (other) =>
        haversineMeters(
          { lat: report.lat, lng: report.lng },
          { lat: other.lat, lng: other.lng }
        ) <= VERIFICATION_RADIUS_M
    ).length;
    return { ...report, verified: nearbyCount >= 2 };
  });
}

export function loadOfflineReports(): FloodReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return [];
    return recomputeVerifications(JSON.parse(raw) as FloodReport[]);
  } catch {
    return [];
  }
}

export function saveOfflineReports(reports: FloodReport[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      OFFLINE_CACHE_KEY,
      JSON.stringify(reports.slice(0, 200))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export async function uploadPhotoToS3(file: File): Promise<string | null> {
  try {
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: file.type || "image/jpeg",
        fileSize: file.size,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      uploadUrl: string | null;
      photoKey: string | null;
      mockUpload?: boolean;
    };
    if (data.mockUpload || !data.uploadUrl || !data.photoKey) {
      return null;
    }

    const putRes = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
    if (!putRes.ok) return null;
    return data.photoKey;
  } catch {
    return null;
  }
}

export async function fetchSharedReports(): Promise<FloodReport[]> {
  const res = await fetch("/api/reports?limit=50", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load reports (${res.status})`);
  const data = (await res.json()) as { reports: FloodReport[] };
  const reports = data.reports ?? [];
  saveOfflineReports(reports);
  return reports;
}

export async function postSharedReport(
  report: Omit<FloodReport, "id" | "createdAt" | "verified">
): Promise<FloodReport[]> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: report.type ?? "waterlogging",
      description: report.description ?? report.reason,
      latitude: report.lat,
      longitude: report.lng,
      severity: report.severity,
      imageUrl: report.photoKey ?? report.thumbnail ?? report.imageUrl ?? null,
      waterPresent: report.waterPresent,
      demoMode: report.demoMode,
    }),
  });
  const data = (await res.json()) as { reports?: FloodReport[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const reports = data.reports ?? [];
  saveOfflineReports(reports);
  return reports;
}

/**
 * Compress an uploaded/captured image to a ~150px thumbnail JPEG data URL
 * strictly under ~20KB for local/demo fallback.
 */
export async function compressImageToThumbnail(
  file: File,
  maxSize = 150,
  maxBytes = 20000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.7;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > maxBytes && quality > 0.25) {
          quality -= 0.15;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
