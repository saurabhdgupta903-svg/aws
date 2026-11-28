import type { RiskLevel } from "./risk";

export interface FloodReport {
  id: string;
  title?: string | null;
  type?: string;
  description?: string;
  lat: number;
  lng: number;
  latitude?: number;
  longitude?: number;
  photoKey?: string;
  photoUrl?: string; // Presigned S3 GET URL or public image URL
  imageUrl?: string | null;
  thumbnail?: string; // Fallback thumbnail for local/offline mode
  waterPresent: boolean;
  severity: RiskLevel;
  reason: string;
  status?: "active" | "resolved";
  verified: boolean;
  demoMode?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface FetchReportsParams {
  limit?: number;
  offset?: number;
  type?: string;
  status?: "active" | "resolved";
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
}

export interface FetchReportsResponse {
  reports: FloodReport[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
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

export async function fetchSharedReports(
  params: FetchReportsParams = {}
): Promise<FetchReportsResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (
    params.minLat !== undefined &&
    params.maxLat !== undefined &&
    params.minLng !== undefined &&
    params.maxLng !== undefined
  ) {
    qs.set("min_lat", String(params.minLat));
    qs.set("max_lat", String(params.maxLat));
    qs.set("min_lng", String(params.minLng));
    qs.set("max_lng", String(params.maxLng));
  }

  const query = qs.toString();
  const res = await fetch(`/api/reports${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as FetchReportsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to load reports (HTTP ${res.status})`);
  }
  return {
    reports: data.reports ?? [],
    total: data.total ?? (data.reports?.length ?? 0),
    limit: data.limit ?? (params.limit ?? 20),
    offset: data.offset ?? (params.offset ?? 0),
    hasMore: Boolean(data.hasMore),
  };
}

export async function postSharedReport(
  report: Omit<FloodReport, "id" | "createdAt" | "verified">
): Promise<FloodReport> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: report.title,
      type: report.type ?? "flood",
      description: report.description ?? report.reason,
      reason: report.reason,
      latitude: report.latitude ?? report.lat,
      longitude: report.longitude ?? report.lng,
      severity: report.severity,
      photoKey: report.photoKey,
      thumbnail: report.thumbnail,
      imageUrl: report.imageUrl,
      waterPresent: report.waterPresent,
      demoMode: report.demoMode,
    }),
  });
  const data = (await res.json()) as { report?: FloodReport; error?: string };
  if (!res.ok || !data.report) {
    throw new Error(data.error || `Failed to save report (HTTP ${res.status})`);
  }
  return data.report;
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
