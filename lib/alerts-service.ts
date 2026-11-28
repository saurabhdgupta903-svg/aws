import { prisma } from "./prisma";
import { haversineMeters } from "./geo";
import { MAHARASHTRA_CITIES } from "./hotspots";
import { sendEmail, type EmailMessage } from "./mailer";
import type { PublicReportDTO } from "./reports-service";

const ALERT_SEVERITIES = new Set(["high", "severe"]);

export function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
}

export function resolveDistrictCoords(
  district?: string | null
): { lat: number; lng: number } | null {
  if (!district) return null;
  const match = MAHARASHTRA_CITIES.find(
    (c) => c.name.toLowerCase() === district.trim().toLowerCase()
  );
  return match ? { lat: match.lat, lng: match.lng } : null;
}

export function doesSubscriptionCoverReport(
  sub: {
    district: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusKm: number;
  },
  report: { latitude: number; longitude: number }
): boolean {
  // If subscriber specified lat/lng, check radius
  if (sub.latitude !== null && sub.longitude !== null) {
    const distM = haversineMeters(
      { lat: sub.latitude, lng: sub.longitude },
      { lat: report.latitude, lng: report.longitude }
    );
    return distM <= sub.radiusKm * 1000;
  }

  // If subscriber specified a district/city name, resolve its center and check 35km radius
  if (sub.district) {
    const cityCoords = resolveDistrictCoords(sub.district);
    if (cityCoords) {
      const distM = haversineMeters(cityCoords, {
        lat: report.latitude,
        lng: report.longitude,
      });
      return distM <= Math.max(sub.radiusKm, 35) * 1000;
    }
  }

  // No area filter = all Maharashtra
  return true;
}

export function buildConfirmationEmail(
  email: string,
  confirmToken: string,
  unsubscribeToken: string,
  district?: string | null
): EmailMessage {
  const base = getAppBaseUrl();
  const confirmUrl = `${base}/api/alerts/confirm?token=${encodeURIComponent(confirmToken)}`;
  const unsubUrl = `${base}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const areaLabel = district ? ` (${district})` : " (All Maharashtra)";

  return {
    to: email,
    subject: "Confirm your FloodLoop Maharashtra flood alerts",
    text: [
      `Hello,`,
      ``,
      `Please confirm your FloodLoop flood alert subscription${areaLabel}:`,
      confirmUrl,
      ``,
      `If you did not request this, you can ignore or unsubscribe:`,
      unsubUrl,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:520px;line-height:1.5;color:#0f172a">
        <h2>Confirm FloodLoop Flood Alerts</h2>
        <p>You requested Maharashtra flood alerts${areaLabel}.</p>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#06b6d4;color:#020617;font-weight:bold;text-decoration:none;border-radius:8px">Confirm Subscription</a></p>
        <p style="font-size:12px;color:#64748b">Or copy this link: ${confirmUrl}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
        <p style="font-size:12px;color:#64748b">Unsubscribe anytime: <a href="${unsubUrl}">${unsubUrl}</a></p>
      </div>
    `,
  };
}

export function buildReportAlertEmail(
  email: string,
  unsubscribeToken: string,
  report: PublicReportDTO
): EmailMessage {
  const base = getAppBaseUrl();
  const mapUrl = `https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=15/${report.latitude}/${report.longitude}`;
  const unsubUrl = `${base}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const timeStr = new Date(report.createdAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return {
    to: email,
    subject: `[FloodLoop ${report.severity.toUpperCase()}] ${report.type.replace("_", " ")} reported`,
    text: [
      `FloodLoop Alert (${report.severity.toUpperCase()})`,
      `Type: ${report.type.replace("_", " ")}`,
      `Description: ${report.description}`,
      `Location: ${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`,
      `Map: ${mapUrl}`,
      `Time: ${timeStr} IST`,
      ``,
      `In an emergency, call 112.`,
      `Unsubscribe: ${unsubUrl}`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:540px;line-height:1.5;color:#0f172a">
        <h2 style="color:#dc2626">FloodLoop Alert: ${report.severity.toUpperCase()}</h2>
        <p><strong>Type:</strong> ${report.type.replace("_", " ")}</p>
        <p><strong>Description:</strong> ${report.description}</p>
        <p><strong>Location:</strong> ${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)} — <a href="${mapUrl}">View on Map</a></p>
        <p><strong>Time:</strong> ${timeStr} IST</p>
        <p style="font-size:13px;color:#b91c1c"><strong>Emergency:</strong> Call 112 if you are in danger.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
        <p style="font-size:12px;color:#64748b">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>
      </div>
    `,
  };
}

/**
 * Notify verified subscribers whose area covers a newly created high/severe report.
 * Designed to be called asynchronously (fire-and-forget) from POST /api/reports.
 */
export async function notifySubscribersForReport(
  report: PublicReportDTO,
  mailerFn: (msg: EmailMessage) => Promise<unknown> = sendEmail
): Promise<number> {
  if (!ALERT_SEVERITIES.has(report.severity)) {
    return 0;
  }

  const verifiedSubs = await prisma.subscription.findMany({
    where: { verified: true },
  });

  const matching = verifiedSubs.filter((sub) =>
    doesSubscriptionCoverReport(sub, report)
  );

  let sentCount = 0;
  for (const sub of matching) {
    try {
      const emailMsg = buildReportAlertEmail(
        sub.email,
        sub.unsubscribeToken,
        report
      );
      await mailerFn(emailMsg);
      sentCount++;
    } catch (err) {
      console.error(
        `[Alerts] Failed sending alert to ${sub.email}:`,
        err instanceof Error ? err.message : "unknown"
      );
    }
  }

  return sentCount;
}
