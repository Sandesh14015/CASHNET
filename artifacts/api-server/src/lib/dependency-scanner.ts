/**
 * Dependency Security Scanner
 * 
 * Scans npm dependencies for:
 * - Known vulnerabilities (from advisory databases)
 * - License compliance issues
 * - Outdated/deprecated packages
 * - Unmaintained dependencies
 * - Supply chain risks
 * 
 * This module provides utilities for:
 * - Loading package.json and package-lock.json
 * - Checking against vulnerability databases
 * - Reporting security issues
 * - Generating compliance reports
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Vulnerability severity levels
export enum VulnerabilitySeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

// Vulnerability record structure
export interface Vulnerability {
  id: string;
  packageName: string;
  affectedVersions: string[];
  severity: VulnerabilitySeverity;
  description: string;
  cve?: string;
  cwes?: string[];
  references: string[];
  fixedVersion?: string;
  publishedDate: string;
}

// Known vulnerabilities database (simplified for demonstration)
// In production, this would integrate with:
// - npm audit API
// - GitHub Security Advisory
// - Snyk database
// - OWASP Dependency-Check
const KNOWN_VULNERABILITIES: Vulnerability[] = [
  {
    id: "NPM-2024-001",
    packageName: "express",
    affectedVersions: ["<5.0.0"],
    severity: VulnerabilitySeverity.MEDIUM,
    description: "Open redirect vulnerability in express.js middleware",
    cve: "CVE-2024-XXXXX",
    cwes: ["CWE-601"],
    references: [
      "https://github.com/expressjs/express/security/advisories/GHSA-xxxx-yyyy-zzzz",
    ],
    fixedVersion: "5.0.0",
    publishedDate: "2024-01-15",
  },
  {
    id: "NPM-2024-002",
    packageName: "cors",
    affectedVersions: ["<2.8.5"],
    severity: VulnerabilitySeverity.LOW,
    description: "Potential information disclosure in CORS headers",
    references: ["https://github.com/expressjs/cors/issues/XXX"],
    fixedVersion: "2.8.5",
    publishedDate: "2024-02-20",
  },
];

// Package license information
export interface PackageLicense {
  packageName: string;
  version: string;
  licenses: string[];
  isCompatible: boolean;
  issues?: string[];
}

// Restricted/problematic licenses for compliance
const RESTRICTED_LICENSES = [
  "GPL", // May require source disclosure
  "AGPL", // Restrictive network copyleft
  "SSPL", // Server-side public license (highly restrictive)
];

// Compatible licenses for commercial use
const COMPATIBLE_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
  "CC0-1.0",
];

// Package.json structure
export interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

// Dependency information
export interface DependencyInfo {
  name: string;
  version: string;
  isDev: boolean;
  isOptional: boolean;
  isDeprecated: boolean;
  vulnerabilities: Vulnerability[];
  licenses: string[];
}

// Scan result
export interface DependencyScanResult {
  timestamp: string;
  packageName: string;
  packageVersion: string;
  totalDependencies: number;
  vulnerableCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  licenseIssues: number;
  deprecatedCount: number;
  vulnerabilities: Vulnerability[];
  licenseProblems: PackageLicense[];
  deprecatedPackages: string[];
  recommendations: string[];
  overallRisk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
}

/**
 * Parse version string for comparison
 * @example "1.2.3" -> [1, 2, 3]
 */
export function parseVersion(version: string): number[] {
  return version
    .replace(/^[^0-9]+/, "") // Remove leading non-numeric chars
    .split(/[^0-9]+/)
    .map((part) => parseInt(part, 10))
    .filter((n) => !Number.isNaN(n));
}

/**
 * Check if a version falls within affected range
 */
export function isVersionAffected(version: string, affectedVersions: string[]): boolean {
  const cleanVersion = version.replace(/^[\^~]/, "");
  const versionParts = parseVersion(cleanVersion);

  for (const affected of affectedVersions) {
    if (affected === cleanVersion || affected === version) {
      return true;
    }

    // Handle version ranges
    if (affected.includes("-")) {
      const [min, max] = affected.split("-").map(parseVersion);
      if (
        versionParts.length >= 1 &&
        versionParts[0] >= min[0] &&
        versionParts[0] <= (max[0] || 999)
      ) {
        return true;
      }
    }

    // Handle < or >
    if (affected.startsWith("<")) {
      const maxVersion = parseVersion(affected.substring(1));
      if (versionParts[0] < maxVersion[0]) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check vulnerabilities for a specific package and version
 */
export function checkVulnerabilities(
  packageName: string,
  version: string
): Vulnerability[] {
  return KNOWN_VULNERABILITIES.filter(
    (vuln) =>
      vuln.packageName.toLowerCase() === packageName.toLowerCase() &&
      isVersionAffected(version, vuln.affectedVersions)
  );
}

/**
 * Check license compatibility
 */
export function checkLicenseCompatibility(
  licenses: string[]
): { isCompatible: boolean; issues: string[] } {
  const issues: string[] = [];

  for (const license of licenses) {
    if (RESTRICTED_LICENSES.some((rl) => license.includes(rl))) {
      issues.push(`License "${license}" may require source code disclosure`);
    }

    if (!COMPATIBLE_LICENSES.some((cl) => license.includes(cl))) {
      if (!license.includes("Unlicense")) {
        issues.push(`License "${license}" compatibility is unclear`);
      }
    }
  }

  return {
    isCompatible: issues.length === 0,
    issues,
  };
}

/**
 * Load and parse package.json
 */
export function loadPackageJson(filePath: string): PackageJson {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load package.json from ${filePath}: ${error}`);
  }
}

/**
 * Get all dependencies from package.json
 */
export function getAllDependencies(pkg: PackageJson): Record<string, string> {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
}

/**
 * Check if a package is deprecated
 */
export function isPackageDeprecated(packageName: string): boolean {
  // In production, this would query npm registry API
  // For now, return a known list of deprecated packages
  const deprecatedPackages = ["node-uuid", "random-bytes", "babylon"];
  return deprecatedPackages.includes(packageName.toLowerCase());
}

/**
 * Calculate overall risk level based on vulnerabilities
 */
export function calculateRiskLevel(
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  licenseIssueCount: number
): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" {
  if (criticalCount > 0) return "CRITICAL";
  if (highCount > 0 || licenseIssueCount > 1) return "HIGH";
  if (mediumCount > 0 || licenseIssueCount > 0) return "MEDIUM";
  return "LOW";
}

/**
 * Generate recommendations based on scan results
 */
export function generateRecommendations(
  result: Omit<DependencyScanResult, "recommendations">
): string[] {
  const recommendations: string[] = [];

  if (result.criticalCount > 0) {
    recommendations.push("🔴 CRITICAL: Address critical vulnerabilities immediately");
  }

  if (result.highCount > 0) {
    recommendations.push("🟠 HIGH: Update packages with high-severity vulnerabilities");
  }

  if (result.vulnerableCount > 0) {
    recommendations.push("🟡 Review all flagged vulnerabilities and update dependencies");
  }

  if (result.licenseIssues > 0) {
    recommendations.push("⚖️ Review license compatibility issues for compliance");
  }

  if (result.deprecatedCount > 0) {
    recommendations.push("⏱️ Replace deprecated packages with maintained alternatives");
  }

  if (result.vulnerableCount === 0) {
    recommendations.push("✅ No known vulnerabilities detected");
  }

  return recommendations;
}

/**
 * Main dependency scanner
 */
export class DependencyScanner {
  private packageJsonPath: string;
  private vulnerabilities: Map<string, Vulnerability[]> = new Map();

  constructor(packageJsonPath: string = "./package.json") {
    this.packageJsonPath = resolve(packageJsonPath);
  }

  /**
   * Run a full security scan
   */
  async scan(): Promise<DependencyScanResult> {
    const pkg = loadPackageJson(this.packageJsonPath);
    const allDeps = getAllDependencies(pkg);

    const vulnerabilities: Vulnerability[] = [];
    const licenseProblems: PackageLicense[] = [];
    const deprecatedPackages: string[] = [];

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;

    // Scan each dependency
    for (const [packageName, version] of Object.entries(allDeps)) {
      const cleanVersion = version.replace(/^[\^~>=<]/, "");
      const vuln = checkVulnerabilities(packageName, cleanVersion);

      if (vuln.length > 0) {
        vulnerabilities.push(...vuln);
        this.vulnerabilities.set(packageName, vuln);

        for (const v of vuln) {
          if (v.severity === VulnerabilitySeverity.CRITICAL) criticalCount++;
          else if (v.severity === VulnerabilitySeverity.HIGH) highCount++;
          else if (v.severity === VulnerabilitySeverity.MEDIUM) mediumCount++;
        }
      }

      // Check if deprecated
      if (isPackageDeprecated(packageName)) {
        deprecatedPackages.push(packageName);
      }

      // License check (in production, would fetch from npm registry)
      const licenseProblem = this.checkPackageLicense(packageName, cleanVersion);
      if (!licenseProblem.isCompatible) {
        licenseProblems.push(licenseProblem);
      }
    }

    const result: DependencyScanResult = {
      timestamp: new Date().toISOString(),
      packageName: pkg.name,
      packageVersion: pkg.version,
      totalDependencies: Object.keys(allDeps).length,
      vulnerableCount: vulnerabilities.length,
      criticalCount,
      highCount,
      mediumCount,
      licenseIssues: licenseProblems.length,
      deprecatedCount: deprecatedPackages.length,
      vulnerabilities,
      licenseProblems,
      deprecatedPackages,
      recommendations: [],
      overallRisk: "INFO",
    };

    result.overallRisk = calculateRiskLevel(
      criticalCount,
      highCount,
      mediumCount,
      licenseProblems.length
    );

    result.recommendations = generateRecommendations(result);

    return result;
  }

  /**
   * Check a specific package for vulnerabilities
   */
  checkPackage(packageName: string, version: string): Vulnerability[] {
    return checkVulnerabilities(packageName, version);
  }

  /**
   * Check package license (simplified - would fetch from npm in production)
   */
  private checkPackageLicense(packageName: string, version: string): PackageLicense {
    // Simplified license data
    const licenseMap: Record<string, string[]> = {
      express: ["MIT"],
      cors: ["MIT"],
      "pino-http": ["MIT"],
      drizzle: ["Apache-2.0"],
      postgres: ["MIT"],
      react: ["MIT"],
      "react-dom": ["MIT"],
      axios: ["MIT"],
      lodash: ["MIT"],
    };

    const licenses = licenseMap[packageName] || ["Unknown"];
    const compatibility = checkLicenseCompatibility(licenses);

    return {
      packageName,
      version,
      licenses,
      isCompatible: compatibility.isCompatible,
      issues: compatibility.issues,
    };
  }

  /**
   * Generate a detailed report
   */
  generateReport(result: DependencyScanResult): string {
    const lines: string[] = [];

    lines.push("═════════════════════════════════════════════════════");
    lines.push("DEPENDENCY SECURITY SCAN REPORT");
    lines.push("═════════════════════════════════════════════════════");
    lines.push("");

    lines.push(`📦 Package: ${result.packageName}@${result.packageVersion}`);
    lines.push(`⏰ Scanned: ${new Date(result.timestamp).toLocaleString()}`);
    lines.push("");

    lines.push("SUMMARY");
    lines.push("───────────────────────────────────────────────────");
    lines.push(
      `Total Dependencies: ${result.totalDependencies} | Vulnerable: ${result.vulnerableCount}`
    );
    lines.push(
      `🔴 Critical: ${result.criticalCount} | 🟠 High: ${result.highCount} | 🟡 Medium: ${result.mediumCount}`
    );
    lines.push(
      `⚖️  License Issues: ${result.licenseIssues} | ⏱️ Deprecated: ${result.deprecatedCount}`
    );
    lines.push(`Overall Risk: ${result.overallRisk}`);
    lines.push("");

    if (result.vulnerabilities.length > 0) {
      lines.push("VULNERABILITIES");
      lines.push("───────────────────────────────────────────────────");
      for (const vuln of result.vulnerabilities) {
        lines.push(`\n${vuln.packageName}@${vuln.affectedVersions.join(", ")}`);
        lines.push(`  Severity: ${vuln.severity}`);
        lines.push(`  ID: ${vuln.id}`);
        if (vuln.cve) lines.push(`  CVE: ${vuln.cve}`);
        lines.push(`  Description: ${vuln.description}`);
        if (vuln.fixedVersion) lines.push(`  Fixed in: ${vuln.fixedVersion}`);
      }
      lines.push("");
    }

    if (result.licenseProblems.length > 0) {
      lines.push("LICENSE ISSUES");
      lines.push("───────────────────────────────────────────────────");
      for (const license of result.licenseProblems) {
        lines.push(`\n${license.packageName}@${license.version}`);
        lines.push(`  Licenses: ${license.licenses.join(", ")}`);
        if (license.issues) {
          for (const issue of license.issues) {
            lines.push(`  ⚠️  ${issue}`);
          }
        }
      }
      lines.push("");
    }

    if (result.deprecatedPackages.length > 0) {
      lines.push("DEPRECATED PACKAGES");
      lines.push("───────────────────────────────────────────────────");
      for (const pkg of result.deprecatedPackages) {
        lines.push(`  ⏱️  ${pkg}`);
      }
      lines.push("");
    }

    lines.push("RECOMMENDATIONS");
    lines.push("───────────────────────────────────────────────────");
    for (const rec of result.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push("");

    lines.push("═════════════════════════════════════════════════════");

    return lines.join("\n");
  }
}

export default DependencyScanner;
