import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedReportInput {
  id?: string;
  title?: string;
  type?: string;
  description?: string;
  reason?: string;
  latitude?: number;
  lat?: number;
  longitude?: number;
  lng?: number;
  severity?: string;
  imageUrl?: string;
  image_url?: string;
  status?: string;
  waterPresent?: boolean;
  verified?: boolean;
  demoMode?: boolean;
  createdAt?: string;
}

const DEFAULT_SEED_REPORTS: SeedReportInput[] = [
  {
    id: "seed-rep-mumbai-sion",
    title: "Sion Circle Waterlogging",
    type: "waterlogging",
    description: "Ankle-to-knee deep water accumulation near Sion Circle underpass; slow traffic.",
    latitude: 19.0434,
    longitude: 72.8634,
    severity: "high",
    status: "active",
    waterPresent: true,
    verified: true,
    demoMode: true,
  },
  {
    id: "seed-rep-pune-sangamwadi",
    title: "Sangamwadi Bridge River Rise",
    type: "flood",
    description: "Mula-Mutha river level rising near Sangamwadi low-lying causeway.",
    latitude: 18.5403,
    longitude: 73.8742,
    severity: "medium",
    status: "active",
    waterPresent: true,
    verified: true,
    demoMode: true,
  },
  {
    id: "seed-rep-kolhapur-panchganga",
    title: "Panchganga Ghat Overflow",
    type: "drain_overflow",
    description: "Drainage overflow along Panchganga riverfront road after heavy showers.",
    latitude: 16.705,
    longitude: 74.222,
    severity: "low",
    status: "active",
    waterPresent: true,
    verified: true,
    demoMode: true,
  },
];

async function main() {
  let items: SeedReportInput[] = DEFAULT_SEED_REPORTS;

  const customFile = process.env.SEED_REPORTS_FILE?.trim();
  const candidatePath = customFile
    ? path.resolve(process.cwd(), customFile)
    : path.resolve(process.cwd(), "data", "reports.seed.json");

  if (fs.existsSync(candidatePath)) {
    const raw = fs.readFileSync(candidatePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      items = parsed as SeedReportInput[];
      console.log(`Loaded ${items.length} report(s) from ${candidatePath}`);
    }
  }

  let upserted = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const latitude = item.latitude ?? item.lat;
    const longitude = item.longitude ?? item.lng;
    const description = (item.description ?? item.reason ?? "").trim();

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !description
    ) {
      continue;
    }

    const id = item.id?.trim() || `seed-rep-${i + 1}`;
    await prisma.report.upsert({
      where: { id },
      update: {
        title: item.title ?? null,
        type: item.type ?? "flood",
        description,
        latitude,
        longitude,
        severity: item.severity ?? "medium",
        imageUrl: item.imageUrl ?? item.image_url ?? null,
        status: item.status ?? "active",
        waterPresent: Boolean(item.waterPresent ?? true),
        verified: Boolean(item.verified ?? true),
        demoMode: Boolean(item.demoMode ?? true),
      },
      create: {
        id,
        title: item.title ?? null,
        type: item.type ?? "flood",
        description,
        latitude,
        longitude,
        severity: item.severity ?? "medium",
        imageUrl: item.imageUrl ?? item.image_url ?? null,
        status: item.status ?? "active",
        waterPresent: Boolean(item.waterPresent ?? true),
        verified: Boolean(item.verified ?? true),
        demoMode: Boolean(item.demoMode ?? true),
        ...(item.createdAt ? { createdAt: new Date(item.createdAt) } : {}),
      },
    });
    upserted++;
  }

  console.log(`Seeded ${upserted} report(s) into the database.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
