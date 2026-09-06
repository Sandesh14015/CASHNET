import type { GraphRelationshipRecord } from "../../repositories/types";

/**
 * DeFi Interaction Service
 *
 * Identifies DeFi protocol interactions from stored transaction/graph data.
 * Historical analysis only — no mempool monitoring.
 */

const METHOD = "cashnet-defi-analysis";
const METHOD_VERSION = "1.0.0";

export type DeFiInteractionType = "SWAP" | "LIQUIDITY_ADD" | "LIQUIDITY_REMOVE" | "BORROW" | "REPAY" | "FLASH_LOAN" | "BRIDGE" | "OTHER";

export interface DeFiInteraction {
  id: string;
  chain: string;
  transactionHash: string;
  protocolAddress: string;
  protocolName?: string;
  interactionType: DeFiInteractionType;
  tokenIn?: string;
  amountIn?: string;
  tokenOut?: string;
  amountOut?: string;
  routerAddress?: string;
  method: string;
  methodVersion: string;
}

/** Known DEX router addresses (partial, extensible via configuration). */
const KNOWN_ROUTERS: Record<string, { name: string; chains: string[] }> = {
  // Uniswap V2/V3 routers
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": { name: "Uniswap V2 Router", chains: ["ETHEREUM"] },
  "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3 Router", chains: ["ETHEREUM", "POLYGON"] },
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { name: "Uniswap V3 Router 02", chains: ["ETHEREUM", "POLYGON"] },
  // PancakeSwap (BSC)
  "0x10ed43c718714eb63d5aa57b78b54704e256024e": { name: "PancakeSwap V2 Router", chains: ["BNB_CHAIN"] },
  "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": { name: "PancakeSwap V3 Router", chains: ["BNB_CHAIN"] },
  // SushiSwap
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": { name: "SushiSwap Router", chains: ["ETHEREUM"] },
  // QuickSwap (Polygon)
  "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff": { name: "QuickSwap Router", chains: ["POLYGON"] },
};

/** Common swap method selectors. */
const SWAP_SELECTORS = new Set([
  "0x38ed1739", // swapExactTokensForTokens
  "0x8803dbee", // swapTokensForExactTokens
  "0x7ff36ab5", // swapExactETHForTokens
  "0x18cbafe5", // swapExactTokensForETH
  "0x5c11d795", // swapExactTokensForTokensSupportingFeeOnTransferTokens
  "0xb6f9de95", // swapExactETHForTokensSupportingFeeOnTransferTokens
  "0x414bf389", // exactInputSingle (V3)
  "0xc04b8d59", // exactInput (V3)
  "0xdb3e2198", // exactOutputSingle (V3)
]);

export class DeFiInteractionService {
  identifyInteractions(edges: GraphRelationshipRecord[]): DeFiInteraction[] {
    const interactions: DeFiInteraction[] = [];
    const seenTxHashes = new Set<string>();

    for (const edge of edges) {
      if (seenTxHashes.has(edge.transactionHash)) continue;

      const toAddr = edge.toAddress.toLowerCase();
      const router = KNOWN_ROUTERS[toAddr];
      if (!router) continue;

      // Verify chain match
      if (!router.chains.includes(edge.chain)) continue;

      seenTxHashes.add(edge.transactionHash);

      interactions.push({
        id: `defi:${edge.chain}:${edge.transactionHash}`,
        chain: edge.chain,
        transactionHash: edge.transactionHash,
        protocolAddress: toAddr,
        protocolName: router.name,
        interactionType: "SWAP",
        method: METHOD,
        methodVersion: METHOD_VERSION,
      });
    }

    return interactions;
  }
}
