import { getDatabase, investigations, wallets } from "./index.js";
import { eq } from "drizzle-orm";

async function runTests() {
  const auditId = `P0-AUDIT-${Date.now()}`;
  console.log("\n======================================================");
  console.log("--- Testing Database Runtime ---");
  
  try {
    const { db } = getDatabase();
    console.log("1. Connection & CREATE Investigation test...");
    const [inv] = await db.insert(investigations).values({
      externalId: auditId,
      name: "Priority 0 Audit Verification",
      status: "OPEN"
    }).returning();
    console.log("CREATE Investigation: PASS", inv.id);

    console.log("2. READ Investigation test...");
    const readInv = await db.query.investigations.findFirst({
      where: eq(investigations.id, inv.id)
    });
    console.log("READ Investigation: " + (readInv?.externalId === auditId ? "PASS" : "FAIL"));

    console.log("3. UPDATE Investigation test...");
    await db.update(investigations).set({ status: "CLOSED" }).where(eq(investigations.id, inv.id));
    const updatedInv = await db.query.investigations.findFirst({ where: eq(investigations.id, inv.id) });
    console.log("UPDATE Investigation: " + (updatedInv?.status === "CLOSED" ? "PASS" : "FAIL"));

    console.log("4. CREATE Wallet test...");
    const [w] = await db.insert(wallets).values({
      investigationId: inv.id,
      address: "0xTestAuditWallet",
      chain: "ETHEREUM"
    }).returning();
    console.log("CREATE Wallet: PASS", w.id);

    console.log("5. DELETE cleanup test...");
    await db.delete(wallets).where(eq(wallets.id, w.id));
    await db.delete(investigations).where(eq(investigations.id, inv.id));
    console.log("DELETE Cleanup: PASS");

  } catch (error) {
    console.log("Database Test Failed: " + (error instanceof Error ? error.message : String(error)));
  }
}

runTests().catch(console.error).finally(() => process.exit(0));
