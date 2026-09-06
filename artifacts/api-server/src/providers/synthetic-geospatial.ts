/**
 * Deterministic synthetic geographic intelligence provider.
 *
 * It deliberately contains no real banking, NCRP, I4C, UPI or ATM data.
 * Replace this module with an authorised provider behind the same route
 * contract before using the application outside the demonstration setting.
 */
export type RiskCategory = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type LocationType = "ATM" | "BANK_BRANCH" | "MERCHANT" | "UPI_MERCHANT" | "UNKNOWN" | "OTHER";

export interface HistoricalTransaction {
  id: string; caseId: string; transactionId: string; transactionType: string;
  amount: number; currency: "INR"; timestamp: string; sourceEntityId: string;
  destinationEntityId: string; latitude: number; longitude: number; state: string;
  district: string; city: string; pincode: string; locationType: LocationType;
  riskScore: number; riskCategory: RiskCategory; fraudType: string; dataSource: "SYNTHETIC"; createdAt: string;
}
export interface PointOfInterest { id: string; name: string; bankName: string; ifsc?: string; latitude: number; longitude: number; city: string; district: string; state: string; pincode: string; status?: string; dataSource: "SYNTHETIC"; }
export interface HistoricalHotspot { clusterId: string; transactionCount: number; totalAmount: number; averageAmount: number; maximumAmount: number; riskAverage: number; riskMax: number; firstTransaction: string; lastTransaction: string; centroidLatitude: number; centroidLongitude: number; radiusKm: number; fraudTypeDistribution: Record<string, number>; primaryFraudType: string; historicalScore: number; city: string; nearbyAtmCount: number; nearbyBranchCount: number; }

type City = { city: string; state: string; district: string; pincode: string; lat: number; lng: number; weight: number };
const cities: City[] = [
  { city: "Bhubaneswar", state: "Odisha", district: "Khordha", pincode: "751001", lat: 20.2961, lng: 85.8245, weight: 78 },
  { city: "Mumbai", state: "Maharashtra", district: "Mumbai", pincode: "400001", lat: 19.076, lng: 72.8777, weight: 72 },
  { city: "Delhi", state: "Delhi", district: "New Delhi", pincode: "110001", lat: 28.6139, lng: 77.209, weight: 70 },
  { city: "Bengaluru", state: "Karnataka", district: "Bengaluru Urban", pincode: "560001", lat: 12.9716, lng: 77.5946, weight: 54 },
  { city: "Hyderabad", state: "Telangana", district: "Hyderabad", pincode: "500001", lat: 17.385, lng: 78.4867, weight: 48 },
  { city: "Cuttack", state: "Odisha", district: "Cuttack", pincode: "753001", lat: 20.4625, lng: 85.883, weight: 42 },
  { city: "Kolkata", state: "West Bengal", district: "Kolkata", pincode: "700001", lat: 22.5726, lng: 88.3639, weight: 28 },
  { city: "Chennai", state: "Tamil Nadu", district: "Chennai", pincode: "600001", lat: 13.0827, lng: 80.2707, weight: 25 },
  { city: "Pune", state: "Maharashtra", district: "Pune", pincode: "411001", lat: 18.5204, lng: 73.8567, weight: 22 },
  { city: "Ahmedabad", state: "Gujarat", district: "Ahmedabad", pincode: "380001", lat: 23.0225, lng: 72.5714, weight: 20 },
  { city: "Lucknow", state: "Uttar Pradesh", district: "Lucknow", pincode: "226001", lat: 26.8467, lng: 80.9462, weight: 17 },
  { city: "Jaipur", state: "Rajasthan", district: "Jaipur", pincode: "302001", lat: 26.9124, lng: 75.7873, weight: 15 },
  { city: "Guwahati", state: "Assam", district: "Kamrup Metropolitan", pincode: "781001", lat: 26.1445, lng: 91.7362, weight: 13 },
  { city: "Patna", state: "Bihar", district: "Patna", pincode: "800001", lat: 25.5941, lng: 85.1376, weight: 12 },
  { city: "Ranchi", state: "Jharkhand", district: "Ranchi", pincode: "834001", lat: 23.3441, lng: 85.3096, weight: 10 },
];
const fraudTypes = ["UPI_FRAUD", "PHISHING", "INVESTMENT_FRAUD", "TASK_FRAUD", "IMPERSONATION_FRAUD", "CARD_FRAUD", "ACCOUNT_TAKEOVER", "ROMANCE_SCAM", "CRYPTO_FRAUD", "OTHER"];
const locationTypes: LocationType[] = ["ATM", "ATM", "ATM", "BANK_BRANCH", "BANK_BRANCH", "MERCHANT", "MERCHANT", "UPI_MERCHANT", "UNKNOWN", "OTHER"];

function random(seed = 20260818) { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const choose = <T,>(items: readonly T[], r: () => number) => items[Math.floor(r() * items.length)]!;
const gaussian = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), .0001))) * Math.cos(2 * Math.PI * r());
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) { const dLat = (bLat - aLat) * Math.PI / 180; const dLng = (bLng - aLng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }

function weightedCity(r: () => number) { const total = cities.reduce((sum, city) => sum + city.weight, 0); let target = r() * total; for (const city of cities) { target -= city.weight; if (target <= 0) return city; } return cities[0]!; }

export function createSyntheticGeoData() {
  const r = random(); const records: HistoricalTransaction[] = []; const now = Date.UTC(2026, 7, 28, 12, 0, 0);
  for (let index = 0; index < 520; index++) {
    const city = weightedCity(r); const isolated = index > 475; const offsetKm = isolated ? 3.5 + r() * 9 : Math.abs(gaussian(r)) * (0.25 + r() * .95);
    const bearing = r() * Math.PI * 2; const latitude = city.lat + (offsetKm * Math.cos(bearing)) / 111.32; const longitude = city.lng + (offsetKm * Math.sin(bearing)) / (111.32 * Math.cos(city.lat * Math.PI / 180));
    const riskScore = Math.min(99, Math.max(35, Math.round(57 + r() * 38 + (isolated ? -10 : 0)))); const riskCategory: RiskCategory = riskScore >= 88 ? "CRITICAL" : riskScore >= 72 ? "HIGH" : riskScore >= 52 ? "MEDIUM" : "LOW";
    const daysAgo = Math.floor(r() * 90); const timestamp = new Date(now - daysAgo * 86400000 - Math.floor(r() * 86400000)).toISOString();
    records.push({ id: `HST-${String(index + 1).padStart(5, "0")}`, caseId: index % 7 === 0 ? "CASE-CASHNET-001" : `CASE-SYN-${String((index % 36) + 1).padStart(3, "0")}`, transactionId: `TXN-HIST-${String(index + 1).padStart(5, "0")}`, transactionType: choose(["ATM_WITHDRAWAL", "TRANSFER", "CARD_PAYMENT", "UPI_TRANSFER"], r), amount: Math.round(8000 + r() * r() * 260000), currency: "INR", timestamp, sourceEntityId: `SRC-${Math.floor(r() * 1800)}`, destinationEntityId: `DST-${Math.floor(r() * 1800)}`, latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)), state: city.state, district: city.district, city: city.city, pincode: city.pincode, locationType: choose(locationTypes, r), riskScore, riskCategory, fraudType: choose(fraudTypes, r), dataSource: "SYNTHETIC", createdAt: timestamp });
  }
  const atms: PointOfInterest[] = Array.from({ length: 210 }, (_, index) => { const city = cities[index % cities.length]!; const angle = r() * Math.PI * 2; const distance = r() * 5; return { id: `ATM-${String(index + 1).padStart(3, "0")}`, name: `Synthetic ATM ${String(index + 1).padStart(3, "0")}`, bankName: choose(["Synthetic National Bank", "Demo Cooperative Bank", "Prototype Bank"], r), latitude: Number((city.lat + distance * Math.cos(angle) / 111.32).toFixed(6)), longitude: Number((city.lng + distance * Math.sin(angle) / (111.32 * Math.cos(city.lat * Math.PI / 180))).toFixed(6)), city: city.city, district: city.district, state: city.state, pincode: city.pincode, status: "ACTIVE", dataSource: "SYNTHETIC" }; });
  const branches: PointOfInterest[] = Array.from({ length: 60 }, (_, index) => { const city = cities[index % cities.length]!; const angle = r() * Math.PI * 2; const distance = r() * 4; return { id: `BRANCH-${String(index + 1).padStart(3, "0")}`, name: `${city.city} Synthetic Branch ${String(index + 1).padStart(2, "0")}`, bankName: choose(["Synthetic National Bank", "Demo Cooperative Bank", "Prototype Bank"], r), ifsc: `SYNB0${String(index + 1).padStart(6, "0")}`, latitude: Number((city.lat + distance * Math.cos(angle) / 111.32).toFixed(6)), longitude: Number((city.lng + distance * Math.sin(angle) / (111.32 * Math.cos(city.lat * Math.PI / 180))).toFixed(6)), city: city.city, district: city.district, state: city.state, pincode: city.pincode, dataSource: "SYNTHETIC" }; });
  return { records, atms, branches };
}

export const syntheticGeoData = createSyntheticGeoData();

export interface GeoFilters { startDate?: string; endDate?: string; city?: string; state?: string; district?: string; fraudType?: string; riskCategory?: string; minAmount?: number; maxAmount?: number; locationType?: string; minRiskScore?: number; caseId?: string; }
export function filterTransactions(records: HistoricalTransaction[], filters: GeoFilters) { return records.filter((item) => (!filters.startDate || item.timestamp >= filters.startDate) && (!filters.endDate || item.timestamp <= `${filters.endDate}T23:59:59.999Z`) && (!filters.city || item.city === filters.city) && (!filters.state || item.state === filters.state) && (!filters.district || item.district === filters.district) && (!filters.fraudType || item.fraudType === filters.fraudType) && (!filters.riskCategory || item.riskCategory === filters.riskCategory) && (!filters.locationType || item.locationType === filters.locationType) && (!filters.caseId || item.caseId === filters.caseId) && (filters.minAmount === undefined || item.amount >= filters.minAmount) && (filters.maxAmount === undefined || item.amount <= filters.maxAmount) && (filters.minRiskScore === undefined || item.riskScore >= filters.minRiskScore)); }

export function detectHotspots(records: HistoricalTransaction[], atms: PointOfInterest[], branches: PointOfInterest[]) {
  const visited = new Set<number>(); const clusters: HistoricalTransaction[][] = []; const epsilonKm = 1.75; const minPoints = 5;
  const neighbours = (i: number) => records.flatMap((candidate, index) => haversineKm(records[i]!.latitude, records[i]!.longitude, candidate.latitude, candidate.longitude) <= epsilonKm ? [index] : []);
  for (let i = 0; i < records.length; i++) { if (visited.has(i)) continue; visited.add(i); const near = neighbours(i); if (near.length < minPoints) continue; const memberIds = new Set(near); const queue = [...near]; while (queue.length) { const point = queue.pop()!; if (!visited.has(point)) { visited.add(point); const more = neighbours(point); if (more.length >= minPoints) for (const item of more) { if (!memberIds.has(item)) { memberIds.add(item); queue.push(item); } } } } clusters.push([...memberIds].map((id) => records[id]!)); }
  const raw = clusters.map((cluster, index) => { const count = cluster.length; const totalAmount = cluster.reduce((sum, item) => sum + item.amount, 0); const centroidLatitude = cluster.reduce((sum, item) => sum + item.latitude, 0) / count; const centroidLongitude = cluster.reduce((sum, item) => sum + item.longitude, 0) / count; const riskAverage = cluster.reduce((sum, item) => sum + item.riskScore, 0) / count; const fraudTypeDistribution = cluster.reduce<Record<string, number>>((map, item) => ({ ...map, [item.fraudType]: (map[item.fraudType] ?? 0) + 1 }), {}); const primaryFraudType = Object.entries(fraudTypeDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "OTHER"; return { clusterId: `HSP-${String(index + 1).padStart(2, "0")}`, transactionCount: count, totalAmount, averageAmount: Math.round(totalAmount / count), maximumAmount: Math.max(...cluster.map((item) => item.amount)), riskAverage: Math.round(riskAverage), riskMax: Math.max(...cluster.map((item) => item.riskScore)), firstTransaction: cluster.map((item) => item.timestamp).sort()[0]!, lastTransaction: cluster.map((item) => item.timestamp).sort().at(-1)!, centroidLatitude, centroidLongitude, radiusKm: Math.max(...cluster.map((item) => haversineKm(centroidLatitude, centroidLongitude, item.latitude, item.longitude))), fraudTypeDistribution, primaryFraudType, city: cluster[0]!.city, density: count / Math.max(.25, Math.PI * Math.max(.25, Math.max(...cluster.map((item) => haversineKm(centroidLatitude, centroidLongitude, item.latitude, item.longitude))) ** 2)), recency: Math.max(...cluster.map((item) => Date.parse(item.timestamp))) }; });
  const maximumDensity = Math.max(...raw.map((item) => item.density), 1); const maximumAmount = Math.max(...raw.map((item) => item.totalAmount), 1); const newest = Math.max(...raw.map((item) => item.recency), 1); const oldest = Math.min(...raw.map((item) => item.recency), newest);
  return raw.map(({ density, recency, ...item }) => ({ ...item, historicalScore: Math.round(Math.min(100, 100 * (.4 * density / maximumDensity + .25 * item.riskAverage / 100 + .2 * item.totalAmount / maximumAmount + .15 * (newest === oldest ? 1 : (recency - oldest) / (newest - oldest))))), nearbyAtmCount: atms.filter((poi) => haversineKm(item.centroidLatitude, item.centroidLongitude, poi.latitude, poi.longitude) <= 2).length, nearbyBranchCount: branches.filter((poi) => haversineKm(item.centroidLatitude, item.centroidLongitude, poi.latitude, poi.longitude) <= 2).length, })) satisfies HistoricalHotspot[];
}

export function nearby<T extends { latitude: number; longitude: number }>(items: T[], latitude: number, longitude: number, radiusKm: number) { return items.filter((item) => haversineKm(latitude, longitude, item.latitude, item.longitude) <= radiusKm).map((item) => ({ ...item, distanceKm: Number(haversineKm(latitude, longitude, item.latitude, item.longitude).toFixed(2)) })).sort((a, b) => a.distanceKm - b.distanceKm); }
