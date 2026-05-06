"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  createUnifiedBalanceKitContext,
  UnifiedBalanceKit,
  deposit,
  spend,
  getBalances,
  estimateSpend,
  isKitError,
} from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { AppKit } from "@circle-fin/app-kit";

// ── App Kit (swap feature) ────────────────────────────────────────────────────
// Instantiated once at module level. The kitKey is injected at build-time via
// NEXT_PUBLIC_KIT_KEY (set in .env.local and in Vercel environment vars).
const KIT_KEY = process.env.NEXT_PUBLIC_KIT_KEY;
const appKit = new AppKit();

// ── Source chains ─────────────────────────────────────────────────────────────
const SOURCE_CHAINS = [
  { id: "Ethereum_Sepolia",  label: "Ethereum Sepolia",  short: "Ethereum",  abbr: "ETH",  color: "#627EEA", fast: false, native: "ETH"  },
  { id: "Base_Sepolia",      label: "Base Sepolia",      short: "Base",      abbr: "BASE", color: "#2563EB", fast: false, native: "ETH"  },
  { id: "Arbitrum_Sepolia",  label: "Arbitrum Sepolia",  short: "Arbitrum",  abbr: "ARB",  color: "#28A0F0", fast: false, native: "ETH"  },
  { id: "Optimism_Sepolia",  label: "Optimism Sepolia",  short: "Optimism",  abbr: "OP",   color: "#FF0420", fast: false, native: "ETH"  },
  { id: "Avalanche_Fuji",    label: "Avalanche Fuji",    short: "Avalanche", abbr: "AVAX", color: "#E84142", fast: true,  native: "AVAX" },
  { id: "Polygon_Amoy",      label: "Polygon Amoy",      short: "Polygon",   abbr: "POL",  color: "#8247E5", fast: true,  native: "MATIC"},
];

// Native-token CoinGecko IDs for price fetching
const COINGECKO_IDS: Record<string, string> = {
  ETH:  "ethereum",
  AVAX: "avalanche-2",
  MATIC:"matic-network",
};

const DEST_CHAIN = "Arc_Testnet";

const CHAIN_IDS: Record<string, string> = {
  Ethereum_Sepolia: "0xaa36a7",
  Base_Sepolia:     "0x14a34",
  Arbitrum_Sepolia: "0x66eee",
  Optimism_Sepolia: "0xaa37dc",
  Avalanche_Fuji:   "0xa869",    // 43113
  Polygon_Amoy:     "0x13882",   // 80002
};

const CHAIN_PARAMS: Record<string, object> = {
  Ethereum_Sepolia: { chainId: "0xaa36a7", chainName: "Sepolia",           rpcUrls: ["https://rpc.ankr.com/eth_sepolia"],       nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://sepolia.etherscan.io"] },
  Base_Sepolia:     { chainId: "0x14a34",  chainName: "Base Sepolia",       rpcUrls: ["https://rpc.ankr.com/base_sepolia"],      nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://sepolia-explorer.base.org"] },
  Arbitrum_Sepolia: { chainId: "0x66eee",  chainName: "Arbitrum Sepolia",   rpcUrls: ["https://rpc.ankr.com/arbitrum_sepolia"],  nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://sepolia.arbiscan.io"] },
  Optimism_Sepolia: { chainId: "0xaa37dc", chainName: "Optimism Sepolia",   rpcUrls: ["https://rpc.ankr.com/optimism_sepolia"], nativeCurrency: { name: "ETH",   symbol: "ETH",   decimals: 18 }, blockExplorerUrls: ["https://sepolia-optimism.etherscan.io"] },
  Avalanche_Fuji:   { chainId: "0xa869",   chainName: "Avalanche Fuji",     rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"], nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 }, blockExplorerUrls: ["https://testnet.snowtrace.io"] },
  Polygon_Amoy:     { chainId: "0x13882",  chainName: "Polygon Amoy",       rpcUrls: ["https://rpc-amoy.polygon.technology"],   nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, blockExplorerUrls: ["https://amoy.polygonscan.com"] },
};

// Circle USDC contract addresses on testnets
const USDC_CONTRACTS: Record<string, string> = {
  Ethereum_Sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  Base_Sepolia:     "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  Arbitrum_Sepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  Optimism_Sepolia: "0x5fd84259d66Cd46123540766Be93DFE6D43130D9",
  Avalanche_Fuji:   "0x5425890298aed601595a70AB815c96711a31Bc65",
  Polygon_Amoy:     "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
};

// Block explorer tx URLs per chain
const CHAIN_EXPLORERS: Record<string, string> = {
  Ethereum_Sepolia: "https://sepolia.etherscan.io/tx/",
  Base_Sepolia:     "https://sepolia-explorer.base.org/tx/",
  Arbitrum_Sepolia: "https://sepolia.arbiscan.io/tx/",
  Optimism_Sepolia: "https://sepolia-optimism.etherscan.io/tx/",
  Avalanche_Fuji:   "https://testnet.snowtrace.io/tx/",
  Polygon_Amoy:     "https://amoy.polygonscan.com/tx/",
  Arc_Testnet:      "https://testnet.arcscan.app/tx/",
};

// Approximate CCTP attestation time per source chain (from Circle docs)
const CHAIN_SPEED: Record<string, string> = {
  Ethereum_Sepolia: "~13-19 min",
  Base_Sepolia:     "~13-19 min",
  Arbitrum_Sepolia: "~13-19 min",
  Optimism_Sepolia: "~13-19 min",
  Avalanche_Fuji:   "~8 sec ⚡",
  Polygon_Amoy:     "~8 sec ⚡",
};

// (RPC endpoints moved server-side to /api/balance — no CORS issues)

/**
 * Smart provider picker — handles Rabby + MetaMask coexistence.
 *
 * When multiple wallets are installed they fight over window.ethereum.
 * EIP-5749 wallets expose window.ethereum.providers[] so we can pick
 * the one the user actually clicked "Connect" on (last-used wins).
 *
 * Priority:
 *  1. window.ethereum.providers[]  — pick MetaMask if present, else first in list
 *  2. window.rabby                 — Rabby standalone injection
 *  3. window.ethereum              — single wallet or winner of the fight
 */
function getProvider(): any {
  const w = window as any;
  // EIP-5749: multiple providers coexist in an array
  const providers: any[] = w.ethereum?.providers ?? [];
  if (providers.length > 0) {
    // Prefer MetaMask; fall back to Rabby; fall back to first available
    return (
      providers.find((p: any) => p.isMetaMask && !p.isRabby) ??
      providers.find((p: any) => p.isRabby) ??
      providers[0]
    );
  }
  // Rabby-only injection (no providers array)
  if (w.rabby) return w.rabby;
  // Single wallet or whichever won the window.ethereum race
  return w.ethereum ?? null;
}

// Read USDC balance via our Next.js API route (server-side RPC — zero CORS issues)
async function readUSDCBalance(chain: string, walletAddress: string): Promise<string | null> {
  if (!USDC_CONTRACTS[chain]) return null;
  try {
    const res = await fetch(`/api/balance?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    const bal = parseFloat(json.balance ?? "0");
    return isNaN(bal) ? null : bal.toFixed(2);
  } catch {
    return null;
  }
}

// Fetch native token price (USD) from CoinGecko public API
async function fetchNativePrice(symbol: string): Promise<number | null> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data[id]?.usd ?? null;
  } catch {
    return null;
  }
}

type Page = "home" | "create" | "pay" | "success";
type TxStep = "idle" | "swapping" | "depositing" | "spending" | "done" | "error";
type PayMode = "usdc" | "native"; // USDC = standard CCTP flow; native = swap ETH/AVAX/MATIC → USDC first

interface Invoice { merchant: string; amount: string; memo: string; chain: string; ts: number; }
interface Balance { chain: string; amount: string; }

function encodeInvoice(inv: Invoice) { return btoa(JSON.stringify(inv)); }
function decodeInvoice(raw: string): Invoice | null { try { return JSON.parse(atob(raw)); } catch { return null; } }
function shortAddr(addr: string) { return addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : ""; }
function fmt(n: string | number) { const v = parseFloat(String(n)); return isNaN(v) ? "0.00" : v.toFixed(2); }
function fmtBal(n: string | number) {
  const v = parseFloat(String(n));
  if (isNaN(v) || v === 0) return null;
  return v.toFixed(2);
}

function parseFees(est: any): string {
  if (!est?.fees) return "";
  const f = est.fees;
  if (typeof f === "string" || typeof f === "number") { const s = String(f); return s && s !== "0" ? `~${s} USDC` : ""; }
  if (f.total !== undefined) { const t = String(f.total); return t && t !== "0" && !t.includes("object") ? `~${t} USDC` : ""; }
  try {
    const src = parseFloat(String(f.source?.amount ?? f.source ?? "0"));
    const dst = parseFloat(String(f.destination?.amount ?? f.destination ?? "0"));
    const sum = (src + dst).toFixed(4).replace(/\.?0+$/, "");
    return sum && sum !== "0" ? `~${sum} USDC` : "";
  } catch { return ""; }
}

const ctx = createUnifiedBalanceKitContext();

function ArcHex({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <polygon points="16,2 27,8.5 27,23.5 16,30 5,23.5 5,8.5" fill="rgba(45,125,252,0.15)" stroke="rgba(45,125,252,0.6)" strokeWidth="1.2"/>
      <text x="16" y="20" textAnchor="middle" fill="#4f96ff" fontSize="7.5" fontFamily="monospace" fontWeight="700" letterSpacing="0.5">ARC</text>
    </svg>
  );
}

function ChainPill({ color, abbr, size = "md" }: { color: string; abbr: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const fs = size === "sm" ? "0.55rem" : size === "lg" ? "0.7rem" : "0.62rem";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: dim, height: dim, borderRadius: "50%",
      background: color + "1a", border: `1.5px solid ${color}55`,
      color, fontSize: fs, fontFamily: "monospace", fontWeight: 700,
      letterSpacing: "0.03em", flexShrink: 0,
    }}>{abbr}</span>
  );
}

function StepDot({ state }: { state: "idle" | "active" | "done" }) {
  const bg = state === "done" ? "#22c55e" : state === "active" ? "#2d7dfc" : "rgba(255,255,255,0.08)";
  const border = state === "done" ? "#22c55e" : state === "active" ? "#4f96ff" : "rgba(255,255,255,0.15)";
  const pulse = state === "active";
  return (
    <span style={{
      display: "inline-flex", width: 12, height: 12, borderRadius: "50%",
      background: bg, border: `2px solid ${border}`, flexShrink: 0,
      boxShadow: state === "active" ? "0 0 0 4px rgba(45,125,252,0.2)" : "none",
      animation: pulse ? "pulseDot 1.2s ease-in-out infinite" : "none",
    }} />
  );
}

export default function ArcPayApp() {
  const [page, setPage] = useState<Page>("home");
  const [wallet, setWallet] = useState("");
  const [adapter, setAdapter] = useState<any>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [payBalances, setPayBalances] = useState<Record<string, string | null>>({});
  const [loadingBal, setLoadingBal] = useState(false);
  const [loadingPayBal, setLoadingPayBal] = useState(false);
  const [cMemo, setCMemo] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [payChain, setPayChain] = useState("Ethereum_Sepolia");
  const [payMode, setPayMode] = useState<PayMode>("usdc");
  const [nativePrice, setNativePrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>("idle");
  const [txMsg, setTxMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txChain, setTxChain] = useState("Ethereum_Sepolia");
  const [txError, setTxError] = useState("");
  const [estimate, setEstimate] = useState("");
  const kitRef = useRef<UnifiedBalanceKit | null>(null);
  // Store the exact provider used at connect time — reused for all subsequent calls
  // This prevents Rabby/MetaMask from switching providers mid-flow (different addresses)
  const providerRef = useRef<any>(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("i");
    if (raw) { const inv = decodeInvoice(raw); if (inv) { setInvoice(inv); setPage("pay"); } }
  }, []);

  const connectWallet = useCallback(async () => {
    const eth = getProvider();
    if (!eth) { alert("Install MetaMask or Rabby to continue."); return; }
    try {
      const [acct] = await eth.request({ method: "eth_requestAccounts" }) as string[];
      providerRef.current = eth; // Lock this provider for the whole session
      setWallet(acct);
      console.log("[ArcPay] Connected:", acct, "| isMetaMask:", eth.isMetaMask, "| isRabby:", eth.isRabby);
      setAdapter(await createViemAdapterFromProvider({ provider: eth, capabilities: { addressContext: "user-controlled" } }));
    } catch (e) { console.error(e); }
  }, []);

  // Home page: load unified balances
  const loadBalances = useCallback(async () => {
    if (!adapter) return;
    setLoadingBal(true);
    try {
      const res = await getBalances(ctx, { sources: { adapter }, includePending: true });
      setBalances(((res as any).chainBalances ?? []).map((cb: any) => ({ chain: String(cb.chain), amount: String(cb.confirmedBalance ?? cb.balance ?? "0") })));
    } catch (e) { console.error(e); }
    finally { setLoadingBal(false); }
  }, [adapter]);

  // Pay page: read USDC balance per chain directly from contracts via public RPC
  const loadPayBalances = useCallback(async (address: string) => {
    if (!address) return;
    setLoadingPayBal(true);
    const results = await Promise.all(
      SOURCE_CHAINS.map(async c => ({ id: c.id, bal: await readUSDCBalance(c.id, address) }))
    );
    const bals: Record<string, string | null> = {};
    results.forEach(r => { bals[r.id] = r.bal; });
    setPayBalances(bals);
    setLoadingPayBal(false);
    // Auto-select chain with highest USDC balance
    const best = results
      .filter(r => r.bal !== null && parseFloat(r.bal ?? "0") > 0)
      .sort((a, b) => parseFloat(b.bal ?? "0") - parseFloat(a.bal ?? "0"))[0];
    if (best) setPayChain(best.id);
  }, []);

  // Fetch native token price when paying with native mode
  const loadNativePrice = useCallback(async (chain: string) => {
    const native = SOURCE_CHAINS.find(c => c.id === chain)?.native ?? "ETH";
    setLoadingPrice(true);
    setNativePrice(null);
    const price = await fetchNativePrice(native);
    setNativePrice(price);
    setLoadingPrice(false);
  }, []);

  useEffect(() => { if (adapter && page === "home") loadBalances(); }, [adapter, page, loadBalances]);
  useEffect(() => { if (wallet && page === "pay") loadPayBalances(wallet); }, [wallet, page, loadPayBalances]);

  // Refresh native price whenever chain or mode changes
  useEffect(() => {
    if (payMode === "native" && page === "pay") loadNativePrice(payChain);
  }, [payMode, payChain, page, loadNativePrice]);

  const generateInvoice = () => {
    if (!wallet) { alert("Connect wallet first."); return; }
    if (!cAmount || parseFloat(cAmount) <= 0) { alert("Enter a valid amount."); return; }
    const inv: Invoice = { merchant: wallet, amount: cAmount, memo: cMemo || "Payment", chain: DEST_CHAIN, ts: Date.now() };
    const link = `${window.location.origin}${window.location.pathname}?i=${encodeInvoice(inv)}`;
    setGeneratedLink(link); setInvoice(inv);
  };

  useEffect(() => {
    if (!adapter || !invoice) return;
    setEstimate("");
    estimateSpend(ctx, { amount: invoice.amount, from: { adapter, allocations: { amount: invoice.amount, chain: payChain as any } }, to: { adapter, chain: DEST_CHAIN as any } })
      .then(est => setEstimate(parseFees(est)))
      .catch(() => {});
  }, [adapter, invoice, payChain]);

  // ── How much native token (ETH/AVAX/MATIC) is needed to cover invoice + fee ─
  const calcNativeNeeded = (): string => {
    if (!nativePrice || !invoice) return "...";
    const need = parseFloat(invoice.amount) + 1.05; // invoice + Circle fee
    const raw = (need / nativePrice) * 1.02;        // +2% slippage buffer
    return raw < 0.0001 ? raw.toExponential(4) : raw.toFixed(6);
  };

  const payInvoice = async () => {
    if (!adapter || !invoice) return;
    setTxStep("depositing"); setTxError(""); setTxHash("");
    kitRef.current = new UnifiedBalanceKit();
    const eth = providerRef.current ?? getProvider();
    if (!eth) { setTxError("No wallet provider found. Install MetaMask or Rabby."); setTxStep("error"); return; }
    try {
      const targetId = CHAIN_IDS[payChain];
      if (targetId) {
        setTxMsg("Switching network...");
        try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: targetId }] }); }
        catch (e: any) {
          if (e.code === 4902 || e.code === -32603) await eth.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS[payChain]] });
          else throw e;
        }
        // Safety: verify chain AND address are correct before proceeding
        const actualChainId: string = await eth.request({ method: "eth_chainId" });
        if (actualChainId.toLowerCase() !== targetId.toLowerCase()) {
          throw new Error(
            `Network mismatch: wallet is on chain ${actualChainId}, expected ${targetId} (${SOURCE_CHAINS.find(c=>c.id===payChain)?.label}). ` +
            `Please switch your wallet to the correct testnet and try again.`
          );
        }
        // Verify the address didn't change (Rabby/MetaMask sometimes switch accounts)
        const currentAccounts: string[] = await eth.request({ method: "eth_accounts" });
        const currentAddr = currentAccounts[0]?.toLowerCase() ?? "";
        console.log("[ArcPay] Pay from:", currentAddr, "| Connected wallet:", wallet, "| Chain:", actualChainId);
        if (currentAddr && currentAddr !== wallet.toLowerCase()) {
          throw new Error(
            `Wallet address changed: connected as ${wallet} but wallet now shows ${currentAddr}. ` +
            `Please reconnect your wallet and try again.`
          );
        }
        const newAdp = await createViemAdapterFromProvider({ provider: eth, capabilities: { addressContext: "user-controlled" } });
        setAdapter(newAdp);
        const srcLabel = SOURCE_CHAINS.find(c => c.id === payChain)?.label ?? payChain;
        const native    = SOURCE_CHAINS.find(c => c.id === payChain)?.native ?? "ETH";

        const CIRCLE_FEE = 1.05;
        const need = parseFloat(invoice.amount);
        const depositTotal = (need + CIRCLE_FEE).toFixed(2);

        // ── STEP 0 (native mode only): Swap native token → USDC via Circle App Kit ──
        if (payMode === "native") {
          setTxStep("swapping");
          const nativeNeeded = calcNativeNeeded();
          const swapLabel = `${nativeNeeded} ${native}`;
          setTxMsg(`Swapping ${swapLabel} → ${depositTotal} USDC via Circle App Kit...`);

          console.log("[ArcPay] AppKit.swap() →", {
            chain: payChain, tokenIn: "NATIVE", tokenOut: "USDC",
            amountIn: nativeNeeded, kitKey: KIT_KEY ? "set" : "MISSING",
          });

          // AppKit.swap() — Circle App Kit v1.4.2
          // tokenIn: "NATIVE" resolves to the chain's native token (ETH/AVAX/MATIC)
          // amountIn: human-readable amount (e.g. "0.005" ETH)
          // kitKey: authenticates Circle's swap routing service
          // On mainnet this executes a real DEX aggregator swap.
          // On testnet the route may not be available — the error is caught below.
          await appKit.swap({
            from: { adapter: newAdp, chain: payChain as any },
            tokenIn:  "NATIVE",
            tokenOut: "USDC",
            amountIn: nativeNeeded,
            config: {
              slippageBps: 150,  // 1.5% slippage tolerance
              kitKey: KIT_KEY,
            } as any,
          });

          console.log("[ArcPay] swap() complete — USDC now in wallet");
          // Brief pause so the USDC balance propagates before deposit()
          await new Promise(r => setTimeout(r, 3_000));
        }

        // ── STEP 1: Deposit USDC → Circle unified balance pool ────────────────────
        setTxMsg(`Depositing ${depositTotal} USDC (${invoice.amount} + ${CIRCLE_FEE} fee) from ${srcLabel}...`);
        setTxStep("depositing");
        console.log("[ArcPay] Depositing", depositTotal, "USDC (need", need, "+ fee", CIRCLE_FEE, ")");
        const depResult = await deposit(ctx, {
          from: { adapter: newAdp, chain: payChain as any },
          amount: depositTotal,
        });
        console.log("[ArcPay] deposit() result:", depResult);

        // ── STEP 2: Wait for CCTP attestation & spend to merchant on Arc Testnet ──
        setTxStep("spending");
        const chainSpeed = CHAIN_SPEED[payChain] ?? "~2-15 min";
        setTxMsg(`Deposit sent — waiting for CCTP attestation (${chainSpeed})...`);

        const msgs = [
          `Waiting for Circle CCTP attestation (${chainSpeed})...`,
          "Cross-chain bridge processing... hang tight...",
          "Circle Gateway attesting the transfer...",
          "Almost there — CCTP finalization in progress...",
        ];
        let msgIdx = 0;
        const msgTimer = setInterval(() => { msgIdx = (msgIdx + 1) % msgs.length; }, 12_000);

        let result: any;
        const spendStart = Date.now();
        const SPEND_TIMEOUT = 1_500_000; // 25 min — covers Ethereum Sepolia's 13-19 min
        try {
          while (true) {
            const elapsed = Math.floor((Date.now() - spendStart) / 1000);
            setTxMsg(msgs[msgIdx] + ` (${elapsed}s)`);
            try {
              console.log("[ArcPay] spend() attempt →", {
                amount: invoice.amount, depositTotal, from: payChain, to: DEST_CHAIN, merchant: invoice.merchant,
              });
              result = await spend(ctx, {
                amount: invoice.amount,
                from: {
                  adapter: newAdp,
                  allocations: { amount: invoice.amount, chain: payChain as any },
                },
                to: {
                  adapter: newAdp,
                  chain: DEST_CHAIN as any,
                  recipientAddress: invoice.merchant,
                },
              });
              break;
            } catch (e: any) {
              const category = e?.errorCategory ?? "";
              const msgStr  = (e?.message ?? "") + (e?.name ?? "");
              const isInsufficientBalance =
                category === "BALANCE_INSUFFICIENT" ||
                msgStr.includes("BALANCE_INSUFFICIENT") ||
                msgStr.includes("INSUFFICIENT");
              const timedOut = Date.now() - spendStart >= SPEND_TIMEOUT;
              if (isInsufficientBalance && !timedOut) {
                console.log(`[ArcPay] spend() not ready (${elapsed}s) — retrying in 15s...`, e?.errorCategory ?? e?.message);
                await new Promise(r => setTimeout(r, 15_000));
                continue;
              }
              throw e;
            }
          }
        } finally {
          clearInterval(msgTimer);
        }
        setTxHash((result as any)?.txHash ?? "");
        setTxChain(DEST_CHAIN);
      } else {
        throw new Error("Unsupported chain: " + payChain);
      }
      setTxStep("done"); setPage("success");
    } catch (e: any) {
      setTxError(isKitError(e) ? `${e.name}: ${e.message}` : e?.message ?? "Unknown error");
      setTxStep("error");
    }
  };

  const copyLink = () => { navigator.clipboard.writeText(generatedLink); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const openLink = () => { window.open(generatedLink, "_blank", "noopener,noreferrer"); };
  const goHome = () => { setPage("home"); window.history.pushState({}, "", "/"); };

  // ── Derived values for the native-pay UI ──────────────────────────────────
  const chainNative  = SOURCE_CHAINS.find(c => c.id === payChain)?.native ?? "ETH";
  const nativeNeeded = calcNativeNeeded();
  const hasKitKey    = !!KIT_KEY;

  return (
    <div className="root">
      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="logo" onClick={goHome}>
            <span className="logo-arc">Arc</span><span className="logo-pay">Pay</span>
            <span className="logo-v">v2</span>
          </div>
          <div className="hdr-nav">
            <button className="nav-link" onClick={goHome}>Dashboard</button>
            <button className="nav-create" onClick={() => setPage("create")}>+ Invoice</button>
            {wallet
              ? <div className="wallet-pill"><span className="w-dot" />{shortAddr(wallet)}</div>
              : <button className="btn-connect" onClick={connectWallet}>Connect Wallet</button>
            }
          </div>
        </div>
      </header>

      <main className="main">

        {/* HOME */}
        {page === "home" && (
          <div className="pg-home">
            <section className="hero">
              <div className="hero-eyebrow">Circle Unified Balance Kit &middot; App Kit &middot; CCTPv2</div>
              <h1 className="hero-h1">Accept USDC<br /><span className="h1-grad">from any chain</span></h1>
              <p className="hero-p">Customers pay with USDC <em>or native ETH</em> from Ethereum, Base, Arbitrum, Optimism, Avalanche or Polygon.<br />You receive USDC on <b>Arc Testnet</b> via Circle's CCTP &mdash; no bridging UI needed.</p>
              <div className="hero-btns">
                <button className="btn-primary" onClick={() => setPage("create")}>Create Invoice</button>
                <a className="btn-outline" href="https://docs.arc.network/app-kit/unified-balance" target="_blank" rel="noreferrer">Docs</a>
              </div>
            </section>

            {/* Flow diagram */}
            <div className="flow-diagram">
              <div className="flow-left">
                <div className="flow-left-label">Pay from any chain</div>
                <div className="flow-chains-row">
                  {SOURCE_CHAINS.map(c => (
                    <div key={c.id} className="flow-chain-item">
                      <ChainPill color={c.color} abbr={c.abbr} size="md" />
                      <span className="flow-chain-name">{c.short}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flow-connector">
                <div className="flow-line" />
                <div className="flow-gw-box">
                  <div className="flow-gw-title">Circle Gateway</div>
                  <div className="flow-gw-sub">App Kit swap &middot; Unified Balance &middot; CCTPv2</div>
                </div>
                <div className="flow-line" />
              </div>
              <div className="flow-right">
                <ArcHex size={48} />
                <div className="flow-arc-title">Arc Testnet</div>
                <div className="flow-arc-sub">Merchant receives USDC</div>
              </div>
            </div>

            {/* Balance */}
            {wallet ? (
              <section className="bal-section">
                <div className="bal-hdr">
                  <h2 className="bal-title">Unified Balance</h2>
                  <button className="btn-refresh" onClick={loadBalances} disabled={loadingBal}>{loadingBal ? "..." : "Refresh"}</button>
                </div>
                {loadingBal ? (
                  <div className="bal-grid">{[1,2,3,4].map(i => <div key={i} className="bal-card shimmer" />)}</div>
                ) : balances.length > 0 ? (
                  <div className="bal-grid">
                    {balances.map(b => {
                      const c = SOURCE_CHAINS.find(x => x.id === b.chain);
                      return (
                        <div key={b.chain} className="bal-card">
                          {c && <ChainPill color={c.color} abbr={c.abbr} size="lg" />}
                          <div className="bal-chain">{c?.label ?? b.chain}</div>
                          <div className="bal-amount">{fmt(b.amount)}</div>
                          <div className="bal-token">USDC</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">No unified balance yet. Deposit USDC from any source chain to get started.</div>
                )}
              </section>
            ) : (
              <div className="cta-connect">
                <ArcHex size={52} />
                <h3>Connect your wallet to continue</h3>
                <p>MetaMask, Rabby, or any EIP-1193 wallet</p>
                <button className="btn-primary" onClick={connectWallet}>Connect Wallet</button>
              </div>
            )}
          </div>
        )}

        {/* CREATE */}
        {page === "create" && (
          <div className="pg-create">
            <div className="pg-hdr">
              <button className="back" onClick={goHome}>&larr; Back</button>
              <h2 className="pg-title">Create Invoice</h2>
            </div>
            {!wallet ? (
              <div className="cta-connect"><ArcHex size={48} /><p>Connect your wallet first</p><button className="btn-primary" onClick={connectWallet}>Connect Wallet</button></div>
            ) : (
              <div className="form-card">
                <div className="field">
                  <label className="field-label">Description</label>
                  <input className="field-input" placeholder="e.g. Consulting - April 2026" value={cMemo} onChange={e => setCMemo(e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Amount (USDC)</label>
                  <div className="field-with-tag">
                    <input className="field-input" type="number" placeholder="10.00" min="0.01" step="0.01" value={cAmount} onChange={e => setCAmount(e.target.value)} />
                    <span className="field-tag">USDC</span>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Your receiving address</label>
                  <div className="addr-box">{wallet}</div>
                  <div className="field-hint">USDC will be minted here on Arc Testnet</div>
                </div>
                <button className="btn-primary w-full" onClick={generateInvoice}>Generate Payment Link</button>

                {generatedLink && (
                  <div className="link-result">
                    <div className="link-result-hdr">
                      <span className="link-ok">Ready to share</span>
                      <div className="link-actions">
                        <button className="btn-open" onClick={openLink}>Open Link</button>
                        <button className="btn-copy" onClick={copyLink}>{copied ? "Copied!" : "Copy Link"}</button>
                      </div>
                    </div>
                    <div className="link-url">{generatedLink}</div>
                    <div className="inv-rows">
                      <div className="inv-row"><span>Amount</span><span>{cAmount} USDC</span></div>
                      <div className="inv-row"><span>Description</span><span>{cMemo || "Payment"}</span></div>
                      <div className="inv-row"><span>Recipient</span><span className="mono">{shortAddr(wallet)}</span></div>
                      <div className="inv-row"><span>Settles on</span><span className="arc-pill">Arc Testnet</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PAY */}
        {page === "pay" && invoice && (
          <div className="pg-pay">
            <div className="pay-card">
              <div className="pay-top">
                <div className="pay-brand"><span className="logo-arc">Arc</span><span className="logo-pay">Pay</span></div>
                <div className="pay-amount">${fmt(invoice.amount)}</div>
                <div className="pay-memo">{invoice.memo}</div>
              </div>

              <div className="pay-details">
                <div className="det-row"><span>Merchant</span><span className="mono">{shortAddr(invoice.merchant)}</span></div>
                <div className="det-row"><span>Amount</span><span>{invoice.amount} USDC</span></div>
                <div className="det-row"><span>Settles on</span><span className="arc-pill">Arc Testnet</span></div>
                {estimate && payMode === "usdc" && <div className="det-row"><span>Est. fees</span><span>{estimate}</span></div>}
              </div>

              {txStep === "idle" && (
                !wallet ? (
                  <div className="pay-action"><button className="btn-primary w-full" onClick={connectWallet}>Connect Wallet to Pay</button></div>
                ) : (
                  <>
                    {/* ── Payment mode toggle ──────────────────────────────── */}
                    <div className="mode-toggle-wrap">
                      <div className="mode-toggle-label">Pay with</div>
                      <div className="mode-toggle">
                        <button
                          className={`mode-btn${payMode === "usdc" ? " mode-btn-active" : ""}`}
                          onClick={() => setPayMode("usdc")}
                        >
                          USDC
                        </button>
                        <button
                          className={`mode-btn${payMode === "native" ? " mode-btn-active" : ""}`}
                          onClick={() => setPayMode("native")}
                          title={hasKitKey ? "Swap native token → USDC via Circle App Kit" : "NEXT_PUBLIC_KIT_KEY not set"}
                        >
                          {chainNative}
                          <span style={{ marginLeft: 4, fontSize: "0.58rem", opacity: 0.7 }}>via App Kit</span>
                        </button>
                      </div>
                    </div>

                    {/* ── Native token info box ────────────────────────────── */}
                    {payMode === "native" && (
                      <div className="native-info-box">
                        <div className="nib-row">
                          <span className="nib-label">Swap</span>
                          <span className="nib-value">
                            {loadingPrice ? "fetching price…" : nativePrice
                              ? `~${nativeNeeded} ${chainNative} → ${invoice.amount} USDC`
                              : `${nativeNeeded} ${chainNative}`
                            }
                          </span>
                        </div>
                        {nativePrice && (
                          <div className="nib-row">
                            <span className="nib-label">Rate</span>
                            <span className="nib-value" style={{ color: "rgba(255,255,255,0.45)" }}>
                              1 {chainNative} ≈ ${nativePrice.toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="nib-row">
                          <span className="nib-label">Flow</span>
                          <span className="nib-value" style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.7rem" }}>
                            {chainNative} → USDC (Circle App Kit) → CCTP → Arc Testnet
                          </span>
                        </div>
                        {!hasKitKey && (
                          <div className="nib-warn">⚠ NEXT_PUBLIC_KIT_KEY not configured — swap will fail</div>
                        )}
                      </div>
                    )}

                    {/* ── Chain picker ─────────────────────────────────────── */}
                    <div className="chain-pick">
                      <div className="chain-pick-label">
                        {payMode === "usdc" ? "Pay USDC from" : `Pay ${chainNative} from`}
                        {loadingPayBal && payMode === "usdc" && <span className="chain-bal-loading">loading balances...</span>}
                      </div>
                      <div className="chain-pick-grid">
                        {SOURCE_CHAINS.map(c => {
                          const bal = payBalances[c.id];
                          const loaded = !loadingPayBal && bal !== undefined;
                          const hasEnough = loaded && bal !== null && parseFloat(bal) >= parseFloat(invoice.amount);
                          const hasSome = loaded && bal !== null && parseFloat(bal) > 0;
                          const isActive = payChain === c.id;
                          // In native mode: never disable (we don't track native balances)
                          const isDisabled = payMode === "usdc" && loaded && !hasSome;
                          return (
                            <button
                              key={c.id}
                              className={`cpick-btn${isActive ? " cpick-active" : ""}${hasSome && payMode === "usdc" ? " cpick-has-bal" : ""}${isDisabled ? " cpick-disabled" : ""}`}
                              onClick={() => !isDisabled && setPayChain(c.id)}
                              disabled={isDisabled}
                              title={isDisabled ? "No USDC on this chain" : undefined}
                            >
                              <ChainPill color={isDisabled ? "#555" : c.color} abbr={c.abbr} size="sm" />
                              <div className="cpick-info">
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span className="cpick-name">{c.short}</span>
                                  {c.fast && <span style={{ fontSize: "0.48rem", background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 3, padding: "1px 4px", fontWeight: 700, letterSpacing: "0.03em" }}>⚡ fast</span>}
                                </div>
                                {payMode === "usdc" ? (
                                  loadingPayBal ? (
                                    <span className="cpick-bal" style={{ color: "rgba(255,255,255,0.2)" }}>…</span>
                                  ) : loaded && bal !== null ? (
                                    <span className="cpick-bal" style={{ color: hasEnough ? "#22c55e" : hasSome ? "#f59e0b" : "rgba(255,255,255,0.25)" }}>
                                      {parseFloat(bal) > 0 ? `${bal} USDC` : "No funds"}
                                    </span>
                                  ) : (
                                    <span className="cpick-bal" style={{ color: "rgba(255,255,255,0.2)" }}>--</span>
                                  )
                                ) : (
                                  <span className="cpick-bal" style={{ color: "rgba(255,255,255,0.4)" }}>
                                    {c.native}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Warning if selected USDC chain doesn't have enough */}
                      {payMode === "usdc" && !loadingPayBal && payBalances[payChain] !== undefined && (
                        (() => {
                          const selBal = parseFloat(payBalances[payChain] ?? "0");
                          const need = parseFloat(invoice.amount);
                          const totalNeeded = need + 1.05;
                          if (selBal === 0) return (
                            <div className="chain-warn chain-warn-error">⚠ No USDC on {SOURCE_CHAINS.find(c=>c.id===payChain)?.short}. Select a chain with funds.</div>
                          );
                          if (selBal < totalNeeded) return (
                            <div className="chain-warn chain-warn-warn">⚠ Need {totalNeeded.toFixed(2)} USDC ({need.toFixed(2)} + 1 fee) — you have {selBal.toFixed(2)} USDC.</div>
                          );
                          return null;
                        })()
                      )}
                    </div>

                    {/* ── Route box ────────────────────────────────────────── */}
                    <div className="route-box">
                      {payMode === "native" && (
                        <>
                          <div className="route-row">
                            <ChainPill color={SOURCE_CHAINS.find(c=>c.id===payChain)?.color??""} abbr={SOURCE_CHAINS.find(c=>c.id===payChain)?.abbr??""} size="sm" />
                            <span className="route-name">{SOURCE_CHAINS.find(c=>c.id===payChain)?.short}</span>
                            <span className="route-amt">~{loadingPrice ? "..." : nativeNeeded} {chainNative}</span>
                          </div>
                          <div className="route-mid" style={{ color: "#a78bfa" }}>
                            Circle App Kit swap → USDC
                          </div>
                        </>
                      )}
                      <div className="route-row">
                        <ChainPill color={SOURCE_CHAINS.find(c=>c.id===payChain)?.color??""} abbr={SOURCE_CHAINS.find(c=>c.id===payChain)?.abbr??""} size="sm" />
                        <span className="route-name">{SOURCE_CHAINS.find(c=>c.id===payChain)?.short}</span>
                        <span className="route-amt">{invoice.amount} USDC</span>
                      </div>
                      <div className="route-mid">
                        via Circle Gateway &middot; CCTP v2
                        <span style={{ marginLeft: 6, fontSize: "0.7rem", color: SOURCE_CHAINS.find(c=>c.id===payChain)?.fast ? "#22c55e" : "rgba(255,255,255,0.35)" }}>
                          {CHAIN_SPEED[payChain] ?? ""}
                        </span>
                      </div>
                      <div className="route-row">
                        <ArcHex size={26} />
                        <span className="route-name">Arc Testnet</span>
                        <span className="route-amt">{invoice.amount} USDC</span>
                      </div>
                    </div>

                    {/* ── Pay button ───────────────────────────────────────── */}
                    {(() => {
                      const selBal = parseFloat(payBalances[payChain] ?? "0");
                      const canPayUsdc = payMode === "usdc" && !loadingPayBal && payBalances[payChain] !== undefined
                        ? selBal >= parseFloat(invoice.amount) + 1.05
                        : true;
                      const canPay = payMode === "native" ? true : canPayUsdc;
                      return (
                        <div className="pay-action">
                          <button className="btn-pay" onClick={payInvoice} disabled={!canPay} style={!canPay ? { opacity: 0.4, cursor: "not-allowed" } : {}}>
                            {payMode === "native"
                              ? `Pay with ${loadingPrice ? "..." : nativeNeeded + " " + chainNative}`
                              : `Pay ${invoice.amount} USDC`
                            }
                          </button>
                        </div>
                      );
                    })()}
                  </>
                )
              )}

              {/* ── Progress steps ─────────────────────────────────────────── */}
              {(txStep === "swapping" || txStep === "depositing" || txStep === "spending") && (
                <div className="tx-prog">
                  <div className="tx-steps">
                    <div className="tx-step">
                      <StepDot state="done" />
                      <span className="ts-done">Network switched</span>
                    </div>
                    <div className="tx-stem" />
                    {payMode === "native" && (
                      <>
                        <div className="tx-step">
                          <StepDot state={txStep === "swapping" ? "active" : "done"} />
                          <span className={txStep === "swapping" ? "ts-active" : "ts-done"}>
                            {chainNative} → USDC swap (App Kit)
                          </span>
                        </div>
                        <div className="tx-stem" />
                      </>
                    )}
                    <div className="tx-step">
                      <StepDot state={txStep === "depositing" ? "active" : txStep === "spending" ? "done" : "idle"} />
                      <span className={txStep === "depositing" ? "ts-active" : txStep === "spending" ? "ts-done" : ""}>
                        Circle cross-chain transfer
                      </span>
                    </div>
                    <div className="tx-stem" />
                    <div className="tx-step">
                      <StepDot state={txStep === "spending" ? "active" : "idle"} />
                      <span className={txStep === "spending" ? "ts-active" : ""}>USDC minted on Arc Testnet</span>
                    </div>
                  </div>
                  <div className="tx-msg">{txMsg}</div>
                  <div className="tx-spin" />
                </div>
              )}

              {txStep === "error" && (
                <div className="tx-err">
                  <div className="tx-err-badge">Error</div>
                  <div className="tx-err-msg">{txError}</div>
                  <button className="btn-outline" onClick={() => { setTxStep("idle"); setTxError(""); }}>Try Again</button>
                </div>
              )}

              {txStep === "done" && (
                <div className="tx-done">
                  <svg width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth="1.5"/><polyline points="15,26 23,34 37,18" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div className="done-title">Payment Sent!</div>
                  <div className="done-sub">USDC settled on Arc Testnet</div>
                  {txHash && <a className="arc-link" href={`${CHAIN_EXPLORERS[txChain] ?? "https://testnet.arcscan.app/tx/"}${txHash}`} target="_blank" rel="noreferrer">View on ArcScan ↗</a>}
                  <button className="btn-primary" onClick={goHome}>Dashboard</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {page === "success" && (
          <div className="pg-success">
            <div className="success-card">
              <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth="1.5"/><polyline points="18,32 28,42 46,22" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <h2 className="suc-title">Payment Complete!</h2>
              <p className="suc-sub">{invoice?.amount} USDC settled on <strong>Arc Testnet</strong> via Circle Unified Balance.</p>
              {txHash && <a className="arc-link" href={`${CHAIN_EXPLORERS[txChain] ?? "https://testnet.arcscan.app/tx/"}${txHash}`} target="_blank" rel="noreferrer">View on ArcScan ↗</a>}
              <button className="btn-primary" onClick={goHome}>Back to Dashboard</button>
            </div>
          </div>
        )}
      </main>

      <footer className="ftr">
        Powered by <a href="https://arc.network" target="_blank" rel="noreferrer">Arc Network</a> &amp; <a href="https://circle.com" target="_blank" rel="noreferrer">Circle Unified Balance Kit</a> &amp; <a href="https://developers.circle.com/stablecoins/app-kit" target="_blank" rel="noreferrer">Circle App Kit</a>
      </footer>
    </div>
  );
}
