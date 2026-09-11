import adminData from "@/data/reference/admin-divisions.json";
import adminGeo from "@/data/generated/admin-geo.json";
import type { BBox } from "@/lib/types";

export interface District {
  id: string;
  name: string;
  fullName: string;
  autonomous: boolean;
  capital: string;
}

export interface Region {
  id: string;
  name: string;
  district: string;
  capital: string;
  autonomousDistrict?: boolean;
}

export const DISTRICTS: District[] = adminData.districts
  .map(({ id, name, fullName, autonomous, capital }) => ({ id, name, fullName, autonomous, capital }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

export const REGIONS: Region[] = adminData.regions.map(({ id, name, district, capital, ...rest }) => ({
  id,
  name,
  district,
  capital,
  autonomousDistrict: "autonomousDistrict" in rest ? Boolean(rest.autonomousDistrict) : undefined,
}));

const districtIndex = new Map(DISTRICTS.map((d) => [d.id, d]));
const regionIndex = new Map(REGIONS.map((r) => [r.id, r]));

export const getDistrict = (id: string | null | undefined) => (id ? districtIndex.get(id) : undefined);
export const getRegion = (id: string | null | undefined) => (id ? regionIndex.get(id) : undefined);

export const COUNTRY_BBOX = adminGeo.country.bbox as BBox;
export const ADMIN_BOUNDARIES_SOURCE = adminGeo.source;

export function districtBbox(id: string): BBox | undefined {
  return (adminGeo.districts as Record<string, { bbox: number[] }>)[id]?.bbox as BBox | undefined;
}
