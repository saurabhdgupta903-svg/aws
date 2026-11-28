import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INITIAL_REPORTS = [
  {
    id: "seed-hindmata-01",
    type: "waterlogging",
    description:
      "Knee-deep waterlogging reported near Hindmata Cinema junction; slow traffic on Dr. B. Ambedkar Road.",
    latitude: 19.0094,
    longitude: 72.8424,
    severity: "high",
    status: "active",
    waterPresent: true,
    verified: true,
    demoMode: true,
  },
  {
    id: "seed-andheri-02",
    type: "road_block",
    description:
      "Andheri Subway closed due to 2ft water accumulation; commuters advised to take Gokhale Bridge.",
    latitude: 19.1197,
    longitude: 72.8464,
    severity: "severe",
    status: "active",
    waterPresent: true,
    verified: true,
    demoMode: true,
  },
  {
    id: "seed-panchganga-03",
    type: "river_flood",
    description:
      "Panchganga river water rising near Rajaram Weir in Kolhapur; low-lying ghats submerged.",
    latitude: 16.705,
    longitude: 74.2433,
    severity: "high",
    status: "active",
    waterPresent: true,
    verified: true,
    demoMode: true,
  },
  {
    id: "seed-tamhini-04",
    type: "landslide",
    description:
      "Minor mudslide and loose boulders along Tamhini Ghat bend; single-lane traffic moving.",
    latitude: 18.45,
    longitude: 73.42,
    severity: "medium",
    status: "active",
    waterPresent: false,
    verified: true,
    demoMode: true,
  },
];

async function main() {
  for (const item of INITIAL_REPORTS) {
    await prisma.report.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }
  console.log(`Seeded ${INITIAL_REPORTS.length} initial FloodLoop reports.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
