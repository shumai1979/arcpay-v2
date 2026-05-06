import { NextRequest, NextResponse } from "next/server";

const USDC: Record<string, string> = {
  Ethereum_Sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  Base_Sepolia:     "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  Arbitrum_Sepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  Optimism_Sepolia: "0x5fd84259d66Cd46123540766Be93DFE6D43130D9",
  Avalanche_Fuji:   "0x5425890298aed601595a70AB815c96711a31Bc65",
  Polygon_Amoy:     "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
};

const RPCS: Record<string, string[]> = {
  Ethereum_Sepolia: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://1rpc.io/sepolia",
    "https://sepolia.drpc.org",
  ],
  Base_Sepolia: [
    "https://base-sepolia-rpc.publicnode.com",
    "https://1rpc.io/base-sepolia",
    "https://base-sepolia.drpc.org",
  ],
  Arbitrum_Sepolia: [
    "https://arbitrum-sepolia-rpc.publicnode.com",
    "https://1rpc.io/arb-sepolia",
    "https://arbitrum-sepolia.drpc.org",
  ],
  Optimism_Sepolia: [
    "https://optimism-sepolia-rpc.publicnode.com",
    "https://1rpc.io/op-sepolia",
    "https://optimism-sepolia.drpc.org",
  ],
  Avalanche_Fuji: [
    "https://avalanche-fuji-c-chain-rpc.publicnode.com",
    "https://api.avax-test.network/ext/bc/C/rpc",
    "https://avalanche-fuji.drpc.org",
  ],
  Polygon_Amoy: [
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://rpc-amoy.polygon.technology",
    "https://polygon-amoy.drpc.org",
  ],
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const chain = searchParams.get("chain") ?? "";
  const address = searchParams.get("address") ?? "";

  if (!chain || !address || !USDC[chain]) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const contract = USDC[chain];
  const data = "0x70a08231" + address.replace("0x", "").toLowerCase().padStart(64, "0");

  for (const rpc of RPCS[chain] ?? []) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: contract, data }, "latest"],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (!json.result || json.result === "0x" || json.error) continue;
      const raw = BigInt(json.result);
      const balance = (Number(raw) / 1_000_000).toFixed(2);
      return NextResponse.json({ balance, rpc });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ balance: "0.00" });
}
