import { readFile } from "node:fs/promises";
type EvaluationCase = { id: string; actual: "POSITIVE" | "NEGATIVE"; predicted: "POSITIVE" | "NEGATIVE" | "UNKNOWN"; rankedCandidateIds?: string[]; expectedCandidateId?: string };
const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;
function evaluateHeldOutCases(cases: EvaluationCase[]) {
  let truePositive = 0, falsePositive = 0, falseNegative = 0, trueNegative = 0, unknown = 0; const ranking = cases.filter((value) => value.expectedCandidateId && value.rankedCandidateIds);
  for (const value of cases) { if (value.predicted === "UNKNOWN") { unknown += 1; if (value.actual === "POSITIVE") falseNegative += 1; continue; } if (value.actual === "POSITIVE" && value.predicted === "POSITIVE") truePositive += 1; else if (value.actual === "NEGATIVE" && value.predicted === "POSITIVE") falsePositive += 1; else if (value.actual === "POSITIVE") falseNegative += 1; else trueNegative += 1; }
  const precision = ratio(truePositive, truePositive + falsePositive), recall = ratio(truePositive, truePositive + falseNegative); const f1 = precision == null || recall == null || precision + recall === 0 ? null : 2 * precision * recall / (precision + recall); const ranks = ranking.map((value) => value.rankedCandidateIds!.indexOf(value.expectedCandidateId!) + 1).filter((value) => value > 0);
  return { samples: cases.length, truePositive, falsePositive, falseNegative, trueNegative, unknown, precision, recall, f1, falsePositiveRate: ratio(falsePositive, falsePositive + trueNegative), falseNegativeRate: ratio(falseNegative, falseNegative + truePositive), coverage: cases.length ? (cases.length - unknown) / cases.length : 0, unknownRate: cases.length ? unknown / cases.length : 0, top1Accuracy: ranking.length ? ranks.filter((rank) => rank === 1).length / ranking.length : null, top3Recall: ranking.length ? ranks.filter((rank) => rank <= 3).length / ranking.length : null, meanReciprocalRank: ranking.length ? ranks.reduce((total, rank) => total + 1 / rank, 0) / ranking.length : null };
}

const path = process.argv[2];
if (!path) throw new Error("Usage: pnpm --filter @workspace/scripts run evaluate-phase5 <held-out-evaluation.json>");
const input = JSON.parse(await readFile(path, "utf8")) as unknown;
if (!Array.isArray(input)) throw new Error("Evaluation input must be a JSON array.");
console.log(JSON.stringify(evaluateHeldOutCases(input as EvaluationCase[]), null, 2));
