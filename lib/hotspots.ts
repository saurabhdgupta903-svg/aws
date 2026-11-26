import hotspotsData from "@/data/hotspots.json";

export type Region =
  | "Mumbai MMR"
  | "Pune"
  | "Konkan"
  | "Western Maharashtra";

export type HazardType = "urban_waterlogging" | "river_flood";

export interface HotspotSeed {
  id: string;
  name: string;
  nameMr: string;
  nameHi: string;
  city: string;
  region: Region;
  lat: number;
  lng: number;
  radiusM: number;
  hazardType: HazardType;
  baseVulnerability: number; // 0 to 1 (estimated)
  elevationM: number; // estimated
  note: string;
}

export interface CityQuickJump {
  name: string;
  lat: number;
  lng: number;
}

export const STATE_CENTER: [number, number] = [18.55, 73.85];
export const STATE_BOUNDS: [[number, number], [number, number]] = [
  [15.6, 72.6],
  [22.1, 80.9],
];

export const REGIONS: Region[] = [
  "Mumbai MMR",
  "Pune",
  "Konkan",
  "Western Maharashtra",
];

export const MAHARASHTRA_CITIES: CityQuickJump[] = [
  { name: "Mumbai", lat: 19.076, lng: 72.8777 },
  { name: "Thane", lat: 19.2183, lng: 72.9781 },
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Kolhapur", lat: 16.705, lng: 74.2433 },
  { name: "Sangli", lat: 16.8524, lng: 74.5815 },
  { name: "Chiplun", lat: 17.533, lng: 73.509 },
];

export const SEEDED_HOTSPOTS: HotspotSeed[] =
  hotspotsData.hotspots as HotspotSeed[];
