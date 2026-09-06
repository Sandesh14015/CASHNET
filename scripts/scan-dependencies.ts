#!/usr/bin/env node

/**
 * Dependency Security Scan CLI Tool
 * 
 * Usage:
 *   npx ts-node scripts/scan-dependencies.ts [package-path]
 *   npx ts-node scripts/scan-dependencies.ts artifacts/api-server
 */

import { DependencyScanner } from "../artifacts/api-server/src/lib/dependency-scanner";
import { resolve } from "path";

async function main() {
  const args = process.argv.slice(2);
  const packagePath = args[0]
    ? resolve(args[0], "package.json")
    : resolve("./package.json");

  console.log(`🔍 Scanning dependencies...`);
  console.log(`📦 Package file: ${packagePath}\n`);

  try {
    const scanner = new DependencyScanner(packagePath);
    const result = await scanner.scan();

    // Display report
    console.log(scanner.generateReport(result));

    // Exit with appropriate code
    if (result.overallRisk === "CRITICAL") {
      console.error("\n❌ CRITICAL vulnerabilities detected!");
      process.exit(2);
    } else if (result.overallRisk === "HIGH") {
      console.error("\n⚠️  HIGH-severity vulnerabilities detected");
      process.exit(1);
    } else if (result.vulnerableCount > 0) {
      console.warn("\n⚠️  Some vulnerabilities detected");
      process.exit(0);
    } else {
      console.log("\n✅ No vulnerabilities detected!");
      process.exit(0);
    }
  } catch (error) {
    console.error("❌ Error scanning dependencies:", error);
    process.exit(2);
  }
}

main();
