import hotspotsData from "@/data/hotspots.json";

export type Region =
  | "Mumbai MMR"
  | "Pune"
  | "Konkan"
  | "Western Maharashtra"
  | "Marathwada"
  | "Vidarbha"
  | "North Maharashtra";

export type HazardType =
  | "urban_waterlogging"
  | "river_flood"
  | "ghat_landslide";

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
  elevationM: number;
  note: string;
}

export interface CityQuickJump {
  name: string;
  lat: number;
  lng: number;
}

export const STATE_CENTER: [number, number] = [19.7515, 75.7139];
export const STATE_BOUNDS: [[number, number], [number, number]] = [
  [15.6, 72.6],
  [22.1, 80.9],
];

export const REGIONS: Region[] = [
  "Mumbai MMR",
  "Pune",
  "Konkan",
  "Western Maharashtra",
  "Marathwada",
  "Vidarbha",
  "North Maharashtra",
];

export const MAHARASHTRA_CITIES: CityQuickJump[] = [
  { name: "Mumbai", lat: 19.076, lng: 72.8777 },
  { name: "Thane", lat: 19.2183, lng: 72.9781 },
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Nashik", lat: 19.9975, lng: 73.7898 },
  { name: "Nagpur", lat: 21.1458, lng: 79.0882 },
  { name: "Kolhapur", lat: 16.705, lng: 74.2433 },
  { name: "Sangli", lat: 16.8524, lng: 74.5815 },
  { name: "Ratnagiri", lat: 16.9902, lng: 73.312 },
  { name: "Chiplun", lat: 17.533, lng: 73.509 },
  { name: "Chh. Sambhajinagar", lat: 19.8762, lng: 75.3433 },
  { name: "Nanded", lat: 19.1383, lng: 77.321 },
  { name: "Chandrapur", lat: 19.9615, lng: 79.2961 },
];

export const SEEDED_HOTSPOTS: HotspotSeed[] =
  hotspotsData.hotspots as HotspotSeed[];
