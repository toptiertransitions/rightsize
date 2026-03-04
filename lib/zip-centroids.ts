import usZips, { Geolocation } from "us-zips";

export function getZipCentroid(zip: string): { lat: number; lng: number } | null {
  const entry: Geolocation | undefined = (usZips as Record<string, Geolocation>)[zip];
  if (!entry) return null;
  return { lat: entry.latitude, lng: entry.longitude };
}

export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
