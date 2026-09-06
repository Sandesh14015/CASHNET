import { Router } from "express";
import { detectHotspots, filterTransactions, haversineKm, nearby, syntheticGeoData, type GeoFilters } from "../providers/synthetic-geospatial";

const router = Router();
const geoAudit: Array<{ action: string; actor: string; caseId?: string; timestamp: string; dataSource: "SYNTHETIC" }> = [];
const numberQuery = (value: unknown) => typeof value === "string" && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
const textQuery = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

function filters(query: Record<string, unknown>): GeoFilters {
  const days = numberQuery(query.days); const end = new Date(Date.UTC(2026, 7, 28, 23, 59, 59));
  return { startDate: textQuery(query.startDate) ?? (days ? new Date(end.getTime() - days * 86400000).toISOString() : undefined), endDate: textQuery(query.endDate), city: textQuery(query.city), state: textQuery(query.state), district: textQuery(query.district), fraudType: textQuery(query.fraudType), riskCategory: textQuery(query.riskCategory), locationType: textQuery(query.locationType), caseId: textQuery(query.caseId), minAmount: numberQuery(query.minAmount), maxAmount: numberQuery(query.maxAmount), minRiskScore: numberQuery(query.minRiskScore) };
}
function currentCaseLocation(caseId: string) {
  // Demonstration coordinate tied to CASE-CASHNET-001, deliberately synthetic.
  return caseId === "CASE-CASHNET-001" ? { caseId, latitude: 20.2961, longitude: 85.8245, label: "Synthetic current case location · Bhubaneswar", dataSource: "SYNTHETIC" as const } : undefined;
}

router.get("/geospatial/historical-transactions", (req, res) => {
  const records = filterTransactions(syntheticGeoData.records, filters(req.query as Record<string, unknown>));
  res.json({ dataSource: "SYNTHETIC", total: records.length, transactions: records });
});
router.get("/geospatial/historical-hotspots", (req, res) => {
  const records = filterTransactions(syntheticGeoData.records, filters(req.query as Record<string, unknown>));
  res.json({ dataSource: "SYNTHETIC", hotspots: detectHotspots(records, syntheticGeoData.atms, syntheticGeoData.branches) });
});
router.get("/geospatial/atms", (req, res) => {
  const city = textQuery(req.query.city); const state = textQuery(req.query.state);
  res.json({ dataSource: "SYNTHETIC", atms: syntheticGeoData.atms.filter((item) => (!city || item.city === city) && (!state || item.state === state)) });
});
router.get("/geospatial/branches", (req, res) => {
  const city = textQuery(req.query.city); const state = textQuery(req.query.state);
  res.json({ dataSource: "SYNTHETIC", branches: syntheticGeoData.branches.filter((item) => (!city || item.city === city) && (!state || item.state === state)) });
});
router.get("/geospatial/historical-summary", (req, res) => {
  const records = filterTransactions(syntheticGeoData.records, filters(req.query as Record<string, unknown>)); const hotspots = detectHotspots(records, syntheticGeoData.atms, syntheticGeoData.branches);
  const types = records.reduce<Record<string, number>>((all, item) => ({ ...all, [item.fraudType]: (all[item.fraudType] ?? 0) + 1 }), {}); const topFraudType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const volumeByDay = records.reduce<Record<string, { date: string; transactions: number; amount: number }>>((all, item) => { const date = item.timestamp.slice(0, 10); const current = all[date] ?? { date, transactions: 0, amount: 0 }; current.transactions++; current.amount += item.amount; all[date] = current; return all; }, {});
  res.json({ dataSource: "SYNTHETIC", totalTransactions: records.length, totalAmount: records.reduce((sum, item) => sum + item.amount, 0), highRiskTransactions: records.filter((item) => item.riskCategory === "HIGH" || item.riskCategory === "CRITICAL").length, hotspotCount: hotspots.length, citiesAffected: new Set(records.map((item) => item.city)).size, topFraudType, topHotspot: [...hotspots].sort((a, b) => b.historicalScore - a.historicalScore)[0] ?? null, dateRange: { first: records.map((item) => item.timestamp).sort()[0] ?? null, last: records.map((item) => item.timestamp).sort().at(-1) ?? null }, volumeByDay: Object.values(volumeByDay).sort((a, b) => a.date.localeCompare(b.date)) });
});
router.get("/geospatial/location-history", (req, res) => {
  const latitude = numberQuery(req.query.latitude); const longitude = numberQuery(req.query.longitude); const radiusKm = numberQuery(req.query.radiusKm) ?? 2;
  if (latitude === undefined || longitude === undefined || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { res.status(400).json({ error: "Valid latitude and longitude are required" }); return; }
  const records = filterTransactions(syntheticGeoData.records, filters(req.query as Record<string, unknown>)); const hotspots = detectHotspots(records, syntheticGeoData.atms, syntheticGeoData.branches);
  res.json({ dataSource: "SYNTHETIC", radiusKm, nearbyTransactions: nearby(records, latitude, longitude, radiusKm), nearbyHotspots: hotspots.filter((item) => haversineKm(latitude, longitude, item.centroidLatitude, item.centroidLongitude) <= radiusKm), nearbyAtms: nearby(syntheticGeoData.atms, latitude, longitude, radiusKm), nearbyBranches: nearby(syntheticGeoData.branches, latitude, longitude, radiusKm) });
});
router.post("/geospatial/proximity-analysis", (req, res) => {
  const { latitude, longitude, radiusKm = 2, ...providedFilters } = req.body as Record<string, unknown>;
  if (typeof latitude !== "number" || typeof longitude !== "number" || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || typeof radiusKm !== "number" || radiusKm <= 0 || radiusKm > 50) { res.status(400).json({ error: "Valid latitude, longitude and radiusKm (0–50) are required" }); return; }
  const records = filterTransactions(syntheticGeoData.records, filters(providedFilters)); const hotspots = detectHotspots(records, syntheticGeoData.atms, syntheticGeoData.branches); const nearbyTransactions = nearby(records, latitude, longitude, radiusKm);
  res.json({ dataSource: "SYNTHETIC", radiusKm, nearbyTransactions, nearbyHotspots: hotspots.filter((item) => haversineKm(latitude, longitude, item.centroidLatitude, item.centroidLongitude) <= radiusKm), nearbyAtms: nearby(syntheticGeoData.atms, latitude, longitude, radiusKm), nearbyBranches: nearby(syntheticGeoData.branches, latitude, longitude, radiusKm), statistics: { transactionCount: nearbyTransactions.length, totalAmount: nearbyTransactions.reduce((sum, item) => sum + item.amount, 0), averageRisk: nearbyTransactions.length ? Math.round(nearbyTransactions.reduce((sum, item) => sum + item.riskScore, 0) / nearbyTransactions.length) : 0 } });
});
router.get("/geospatial/case-context/:caseId", (req, res) => {
  const location = currentCaseLocation(req.params.caseId); if (!location) { res.status(404).json({ error: "No synthetic geographic location for this case" }); return; }
  const records = syntheticGeoData.records; const hotspots = detectHotspots(records, syntheticGeoData.atms, syntheticGeoData.branches); const radiusKm = numberQuery(req.query.radiusKm) ?? 2;
  res.json({ dataSource: "SYNTHETIC", currentCaseLocation: location, currentFundFlow: [{ id: "CURRENT-FLOW-01", latitude: location.latitude, longitude: location.longitude, label: "Synthetic last known entity" }], radiusKm, relatedTransactions: nearby(records, location.latitude, location.longitude, radiusKm), relatedHotspots: hotspots.filter((item) => haversineKm(location.latitude, location.longitude, item.centroidLatitude, item.centroidLongitude) <= radiusKm), nearbyAtms: nearby(syntheticGeoData.atms, location.latitude, location.longitude, radiusKm), nearbyBranches: nearby(syntheticGeoData.branches, location.latitude, location.longitude, radiusKm) });
});
router.post("/geospatial/audit", (req, res) => {
  const action = typeof req.body?.action === "string" ? req.body.action : "MAP_OPENED";
  const caseId = typeof req.body?.caseId === "string" ? req.body.caseId : undefined;
  const event = { action, caseId, actor: "demo.investigator", timestamp: new Date().toISOString(), dataSource: "SYNTHETIC" as const };
  geoAudit.push(event); res.status(201).json(event);
});
router.get("/geospatial/audit", (_req, res) => res.json({ dataSource: "SYNTHETIC", events: geoAudit }));
router.get("/geospatial/export", (req, res) => {
  const records = filterTransactions(syntheticGeoData.records, filters(req.query as Record<string, unknown>));
  const lines = [["transaction_id", "case_id", "amount", "timestamp", "state", "district", "city", "risk_score", "fraud_type", "location_type", "data_source"], ...records.map((item) => [item.transactionId, item.caseId, item.amount, item.timestamp, item.state, item.district, item.city, item.riskScore, item.fraudType, item.locationType, item.dataSource])].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=cashnet-historical-synthetic-analysis.csv"); res.send(lines.join("\n"));
});

export default router;
