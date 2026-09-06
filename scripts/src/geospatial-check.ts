import assert from "node:assert/strict";
import {
  detectHotspots,
  filterTransactions,
  nearby,
  syntheticGeoData,
} from "../../artifacts/api-server/src/providers/synthetic-geospatial";

const { records, atms, branches } = syntheticGeoData;
assert.equal(records.length, 520, "the synthetic transaction seed must remain deterministic");
assert.equal(atms.length, 210, "the synthetic ATM seed must meet the prototype requirement");
assert.equal(branches.length, 60, "the synthetic branch seed must meet the prototype requirement");
assert(records.every((item) => item.dataSource === "SYNTHETIC" && item.latitude >= -90 && item.latitude <= 90 && item.longitude >= -180 && item.longitude <= 180), "synthetic coordinates must be valid and labelled");

const bhubaneswar = filterTransactions(records, { city: "Bhubaneswar" });
assert(bhubaneswar.length > 0, "city filtering must use the source dataset");
const hotspots = detectHotspots(records, atms, branches);
assert(hotspots.length > 0 && hotspots.every((item) => item.historicalScore >= 0 && item.historicalScore <= 100), "hotspots must be dynamically scored");
assert(nearby(atms, 20.2961, 85.8245, 10).length > 0, "proximity calculations must return synthetic facilities");

console.log(`Geospatial checks passed: ${records.length} transactions, ${hotspots.length} hotspots.`);
