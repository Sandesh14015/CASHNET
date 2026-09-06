import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createConfig } from "./config";
import { RateLimitError, UnsupportedChainError } from "./errors/app-error";
import { EsploraBitcoinProvider } from "./services/blockchain/esplora-provider";
import { EtherscanEthereumProvider } from "./services/blockchain/etherscan-provider";
import { ProviderHttpClient } from "./services/blockchain/http-client";
import { ProviderRouter } from "./services/blockchain/provider-router";
import { TronGridProvider } from "./services/blockchain/trongrid-provider";

const authorized = () => createConfig({ CASHNET_DATA_MODE: "authorized", ETHERSCAN_API_KEY: "configured", BITCOIN_ESPLORA_BASE_URL: "https://example.invalid/api", TRONGRID_API_KEY: "configured", POLYGONSCAN_API_KEY: "configured", BNB_NODEREAL_API_KEY: "configured", CASHNET_PROVIDER_MAX_RETRIES: "0" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("Etherscan V2 normalizes native transactions and preserves raw provenance", async () => {
  const provider = new EtherscanEthereumProvider(authorized(), async () => json({ status: "1", result: [{ hash: "0xabc", blockNumber: "1", timeStamp: "1700000000", from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", value: "12", gas: "21000", gasPrice: "3", gasUsed: "21000", input: "0x", isError: "0" }] }));
  const result = await provider.getTransactions("0x1111111111111111111111111111111111111111");
  assert.equal(result.status, "SUCCESS");
  if (result.status !== "SUCCESS") throw new Error("expected success");
  assert.equal(result.data[0].transaction.fee, "63000");
  assert.equal(result.data[0].transaction.provenance.provider, "etherscan-v2");
});
  test("BNB uses NodeReal MegaNode endpoint and normalizes properly", async () => {
    const { NodeRealBnbProvider } = await import("./services/blockchain/nodereal-provider");
    let interceptedUrl = "";
    let interceptedBody = "";
    const provider = new NodeRealBnbProvider(authorized(), async (url, init) => {
        interceptedUrl = url.toString();
        interceptedBody = String(init?.body || "");
        return json({ jsonrpc: "2.0", id: 1, result: { transfers: [{ hash: "0xabc", blockNum: "0x1", blockTimestamp: "0x654321", from: "0x11", to: "0x22", value: "0xc", gasUsed: "0x15", gasPrice: "0x3", receiptsStatus: 1 }] } });
    });
    const result = await provider.getTransactions("0x11");
    assert.equal(result.status, "SUCCESS");
    if (result.status !== "SUCCESS") throw new Error("expected success");
    assert.equal(interceptedUrl.includes("bsc-mainnet.nodereal.io"), true);
    assert.equal(result.data[0].transaction.provenance.provider, "nodereal");
    assert.equal(result.data[0].transaction.chain, "BNB_CHAIN");
    assert.equal(result.data[0].transaction.value, "12");
  });

test("PolygonBlockscout normalizes correctly and sets provenance", async () => {
  const { PolygonBlockscoutProvider } = await import("./services/blockchain/blockscout-provider");
  let interceptedUrl = "";
  const provider = new PolygonBlockscoutProvider(authorized(), async (url) => {
    interceptedUrl = url.toString();
    if (interceptedUrl.includes("v2/blocks")) {
      return json({ hash: "0xpoly", height: 1 });
    }
    return json({ status: "1", result: [{ hash: "0xpoly", blockNumber: "1", timeStamp: "1700000000", from: "0x11", to: "0x22", value: "12", gas: "21", gasPrice: "3", gasUsed: "21", input: "0x", isError: "0" }] });
  });
  const txs = await provider.getTransactions("0x11");
  assert.equal(txs.status, "SUCCESS");
  if (txs.status !== "SUCCESS") throw new Error("expected success");
  assert.equal(interceptedUrl.includes("polygon.blockscout.com/api"), true);
  assert.equal(txs.data[0].transaction.provenance.provider, "blockscout");

  const block = await provider.getBlock("1");
  assert.equal(block.status, "SUCCESS");
  if (block.status === "SUCCESS" && block.data) {
    assert.equal(block.data.hash, "0xpoly");
  }
});

test("Esplora preserves Bitcoin UTXO input and output semantics", async () => {
  const provider = new EsploraBitcoinProvider(authorized(), async () => json([{ txid: "bitcoin-tx", fee: 12, status: { confirmed: true, block_height: 100, block_hash: "block", block_time: 1700000000 }, vin: [{ txid: "previous", vout: 1, prevout: { value: 500, scriptpubkey_address: "bc1qsource", scriptpubkey: "0014" } }], vout: [{ value: 488, scriptpubkey_address: "bc1qtarget", scriptpubkey: "0014" }] }]));
  const result = await provider.getTransactions("bc1qtestaddress0000000000000000000000000000000000000");
  assert.equal(result.status, "SUCCESS");
  if (result.status !== "SUCCESS") throw new Error("expected success");
  assert.equal(result.data[0].transaction.inputs[0].previousOutputIndex, 1);
  assert.equal(result.data[0].transaction.outputs[0].value, "488");
  assert.equal((await provider.getTokenTransfers("x")).status, "UNSUPPORTED_CAPABILITY");
});

test("TronGrid normalizes TRC-20 transfers without inventing attribution", async () => {
  const provider = new TronGridProvider(authorized(), async () => json({ data: [{ transaction_id: "tron-tx", from: "TFrom111111111111111111111111111111", to: "TTo11111111111111111111111111111111", value: "7", token_info: { symbol: "USDT", address: "TContract111111111111111111111111111" } }] }));
  const result = await provider.getTokenTransfers("TFrom111111111111111111111111111111");
  assert.equal(result.status, "SUCCESS");
  if (result.status !== "SUCCESS") throw new Error("expected success");
  assert.equal(result.data[0].asset, "USDT");
  assert.equal(result.data[0].provenance.provider, "trongrid");
});

test("provider HTTP handling maps rate limits and router rejects unsupported chains", async () => {
  const client = new ProviderHttpClient({ timeoutMs: 100, maxRetries: 0 }, async () => json({}, 429));
  await assert.rejects(() => client.getJson("https://example.invalid"), RateLimitError);
  const router = new ProviderRouter(authorized());
  assert.throws(() => router.forChain("OTHER"), UnsupportedChainError);
  assert.throws(() => new ProviderRouter(createConfig({ CASHNET_DATA_MODE: "synthetic" })).forChain("ETHEREUM"), UnsupportedChainError);
});

test("Phase 3 migration and ledger define idempotent provider persistence", async () => {
  const migration = await readFile(new URL("../../../database/migrations/20260829_phase3_provider_persistence.sql", import.meta.url), "utf8");
  for (const item of ["wallets_case_chain_address_unique", "token_transfers_transaction_identity_unique", "contract_interactions_transaction_identity_unique"]) assert.match(migration, new RegExp(item));
  const runner = await readFile(new URL("../../../lib/db/src/migrate.ts", import.meta.url), "utf8");
  assert.match(runner, /20260829_phase3_provider_persistence/);
});
