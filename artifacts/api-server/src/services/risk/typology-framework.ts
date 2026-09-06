import type { RiskIndicatorResult, Severity } from "./aml-risk-indicator-service";

/**
 * Risk Typology Framework
 *
 * A typology is a named pattern of risk indicators that, when observed together,
 * suggest a particular category of suspicious behavior.
 *
 * IMPORTANT: A matched typology is a CANDIDATE or ASSESSMENT, never a conclusion.
 * Every typology match requires human review for consequential decisions.
 */

export interface TypologyDefinition {
  code: string;
  name: string;
  description: string;
  version: string;
  requiredIndicatorTypes: string[];
  minIndicators: number;
  severity: Severity;
}

export interface TypologyMatch {
  typology: TypologyDefinition;
  matchedIndicators: RiskIndicatorResult[];
  matchCount: number;
  confidence: "CANDIDATE" | "LIKELY" | "REVIEW_REQUIRED";
  explanation: string;
}

// Default typology definitions (also seeded in migration)
const DEFAULT_TYPOLOGIES: TypologyDefinition[] = [
  {
    code: "RAPID_MOVEMENT", name: "Rapid Fund Movement", version: "1.0.0",
    description: "Funds received and sent within a short time window, suggesting pass-through behavior.",
    requiredIndicatorTypes: ["RAPID_IN_OUT", "HIGH_VELOCITY"],
    minIndicators: 1, severity: "MEDIUM",
  },
  {
    code: "STRUCTURING", name: "Structuring-Like Behavior", version: "1.0.0",
    description: "Multiple transactions of similar amounts that may indicate deliberate structuring. Contextual — not proof of illegality.",
    requiredIndicatorTypes: ["ROUND_NUMBER_PATTERN", "BURST_ACTIVITY", "SIMILAR_AMOUNTS"],
    minIndicators: 2, severity: "MEDIUM",
  },
  {
    code: "LAYERING", name: "Layering-Like Pattern", version: "1.0.0",
    description: "Complex multi-hop transaction paths with diminishing values, suggesting layering behavior.",
    requiredIndicatorTypes: ["PEEL_CHAIN", "FAN_OUT", "MULTI_HOP_DIMINISHING"],
    minIndicators: 2, severity: "HIGH",
  },
  {
    code: "HIGH_RISK_EXPOSURE", name: "High-Risk Service Exposure", version: "1.0.0",
    description: "Significant interaction with addresses flagged by intelligence sources.",
    requiredIndicatorTypes: ["SERVICE_EXPOSURE", "SANCTIONED_INTERACTION"],
    minIndicators: 1, severity: "HIGH",
  },
  {
    code: "CONCENTRATION", name: "Counterparty Concentration", version: "1.0.0",
    description: "Disproportionate transaction volume with a small number of counterparties.",
    requiredIndicatorTypes: ["COUNTERPARTY_CONCENTRATION", "FAN_IN"],
    minIndicators: 1, severity: "LOW",
  },
];

export class RiskTypologyFramework {
  private readonly typologies: TypologyDefinition[];

  constructor(typologies?: TypologyDefinition[]) {
    this.typologies = typologies ?? DEFAULT_TYPOLOGIES;
  }

  evaluateIndicators(indicators: RiskIndicatorResult[]): TypologyMatch[] {
    const indicatorTypes = new Set(indicators.map((i) => i.indicatorType));
    const matches: TypologyMatch[] = [];

    for (const typology of this.typologies) {
      const matched = indicators.filter((i) =>
        typology.requiredIndicatorTypes.includes(i.indicatorType)
      );

      if (matched.length < typology.minIndicators) continue;

      const matchedTypeCount = typology.requiredIndicatorTypes.filter((t) => indicatorTypes.has(t as RiskIndicatorResult["indicatorType"])).length;
      const coverageRatio = matchedTypeCount / typology.requiredIndicatorTypes.length;

      let confidence: TypologyMatch["confidence"];
      if (coverageRatio >= 0.8 && matched.length >= typology.minIndicators * 2) {
        confidence = "LIKELY";
      } else if (coverageRatio >= 0.5) {
        confidence = "CANDIDATE";
      } else {
        confidence = "REVIEW_REQUIRED";
      }

      matches.push({
        typology,
        matchedIndicators: matched,
        matchCount: matched.length,
        confidence,
        explanation: `Typology "${typology.name}" matched ${matched.length} indicator(s) covering ${matchedTypeCount}/${typology.requiredIndicatorTypes.length} required types. Coverage: ${Math.round(coverageRatio * 100)}%. This is an ASSESSMENT requiring human review.`,
      });
    }

    return matches;
  }
}
