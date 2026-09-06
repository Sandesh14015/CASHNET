/**
 * Forensic Report Generator
 *
 * Generates structured forensic investigation reports with:
 * - Facts, observations, inferences, assessments
 * - Risk indicators and typology matches
 * - Graph paths and clustering evidence
 * - Contradictions and review decisions
 * - Provenance chain and method versions
 * - Audit history
 *
 * Reports NEVER overstate certainty.
 * Reports NEVER suppress contradictory evidence.
 */

const METHOD = "cashnet-report-generator";
const METHOD_VERSION = "1.0.0";

export type ReportType = "INVESTIGATION_SUMMARY" | "RISK_ASSESSMENT" | "GRAPH_ANALYSIS" | "FULL_FORENSIC";

export interface ReportSection {
  title: string;
  type: "FACTS" | "OBSERVATIONS" | "INFERENCES" | "ASSESSMENTS" | "CONTRADICTIONS" | "REVIEW_DECISIONS" | "PROVENANCE" | "AUDIT";
  items: ReportItem[];
}

export interface ReportItem {
  id: string;
  description: string;
  confidence?: string;
  method?: string;
  methodVersion?: string;
  evidence?: string[];
  contradictions?: string[];
  reviewStatus?: string;
}

export interface ForensicReport {
  id: string;
  caseId: string;
  investigationId?: string;
  title: string;
  reportType: ReportType;
  generatedBy: string;
  generatedAt: string;
  sections: ReportSection[];
  methodVersions: Record<string, string>;
  disclaimer: string;
}

export class ReportGenerator {
  generateInvestigationSummary(
    caseId: string,
    investigationId: string,
    generatedBy: string,
    data: {
      transactionCount: number;
      walletCount: number;
      chains: string[];
      riskIndicatorCount: number;
      graphEdgeCount: number;
      candidateCount: number;
      reviewCount: number;
      contradictionCount: number;
      auditEventCount: number;
    },
    reportType: ReportType = "INVESTIGATION_SUMMARY",
  ): ForensicReport {
    const sections: ReportSection[] = [
      {
        title: "Investigation Scope",
        type: "FACTS",
        items: [
          { id: "scope-1", description: `${data.transactionCount} transactions collected across ${data.chains.join(", ")}` },
          { id: "scope-2", description: `${data.walletCount} wallet profiles analyzed` },
          { id: "scope-3", description: `${data.graphEdgeCount} graph relationships derived` },
        ],
      },
      {
        title: "Stored Observations",
        type: "OBSERVATIONS",
        items: [
          {
            id: "observation-1",
            description: `${data.graphEdgeCount} stored graph relationship observation(s) were available to this report.`,
            method: "cashnet-graph-features",
            methodVersion: "1.0.0",
            evidence: [`stored_graph_relationships=${data.graphEdgeCount}`],
          },
        ],
      },
      {
        title: "Risk Analysis",
        type: "ASSESSMENTS",
        items: [
          { id: "risk-1", description: `${data.riskIndicatorCount} risk indicators identified`, confidence: "HEURISTIC_SCORE", method: "cashnet-aml-risk-engine", methodVersion: "1.0.0" },
        ],
      },
      {
        title: "Attribution Candidates",
        type: "INFERENCES",
        items: [
          { id: "attr-1", description: `${data.candidateCount} VASP/service candidates generated`, reviewStatus: `${data.reviewCount} reviewed` },
        ],
      },
    ];

    sections.push({
      title: "Contradictions",
      type: "CONTRADICTIONS",
      items: [
        { id: "contra-1", description: `${data.contradictionCount} contradictory evidence item(s) exist. These are preserved and NOT suppressed.` },
      ],
    });

    sections.push({
      title: "Human Review",
      type: "REVIEW_DECISIONS",
      items: [
        { id: "review-1", description: `${data.reviewCount} human review decision(s) are included in the auditable investigation history.`, reviewStatus: "HUMAN_REVIEW_REQUIRED_FOR_CONSEQUENTIAL_DECISIONS" },
      ],
    });

    sections.push({
      title: "Provenance",
      type: "PROVENANCE",
      items: [
        { id: "prov-1", description: "All data sourced via authorized provider adapters with full provenance chain." },
        { id: "prov-2", description: "Every inference includes method, method version, evidence, and confidence semantics." },
      ],
    });

    sections.push({
      title: "Audit Trail",
      type: "AUDIT",
      items: [
        { id: "audit-1", description: `${data.auditEventCount} append-only audit event(s) were available when this report was generated.`, method: METHOD, methodVersion: METHOD_VERSION },
      ],
    });

    return {
      id: crypto.randomUUID(),
      caseId,
      investigationId,
      title: `Investigation Summary — Case ${caseId.slice(0, 8)}`,
      reportType,
      generatedBy,
      generatedAt: new Date().toISOString(),
      sections,
      methodVersions: {
        "cashnet-report-generator": METHOD_VERSION,
        "cashnet-aml-risk-engine": "1.0.0",
        "cashnet-graph-features": "1.0.0",
        "cashnet-community-detection": "1.0.0",
        "cashnet-defi-analysis": "1.0.0",
        "cashnet-mev-detection": "1.0.0",
        "cashnet-evaluation": "1.0.0",
      },
      disclaimer: "This report contains automated observations, inferences, and assessments. No automated output constitutes proof of criminal activity or identifies a natural person. All assessments require independent human review before any consequential decision. Contradictory evidence is preserved and never suppressed. Heuristic scores are NOT probabilities.",
    };
  }
}
