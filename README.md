# ArcPay v2

**Cross-chain USDC payment demo built on Circle's Unified Balance Kit and Arc Testnet.**

Live demo → [arcpay-v2.vercel.app](https://arcpay-v2.vercel.app)

---

## What is ArcPay?

ArcPay demonstrates the full cross-chain payment flow powered by [Circle's Unified Balance Kit](https://developers.circle.com/gateway) and [Arc Testnet](https://arc.network):

- A **payer** on Ethereum, Base, Arbitrum, or Optimism testnets sends USDC
- Circle's **CCTP v2 bridge** attests and routes the transfer cross-chain
- The **merchant receives USDC on Arc Testnet** — no bridging UI, no manual steps

This is built to showcase Circle's Gateway technology to the Arc Network team.

---

## Architecture

```
Payer Wallet (Ethereum / Base / Arbitrum / Optimism Sepolia)
        │
        │  1. deposit() — USDC locked in Circle's unified pool
        │
        ▼
Circle Unified Balance Kit + CCTP v2
        │
        │  2. spend() — cross-chain transfer attested (~1-3 min)
        │
        ▼
Arc Testnet — Merchant receives USDC
```

### Key SDK calls

```typescript
// 1. Deposit from source chain into Circle's unified pool
await deposit(ctx, {
  from: { adapter, chain: "Ethereum_Sepolia" },
  amount: "11.05",  // invoice amount + 1.05 USDC protocol fee buffer
});

// 2. Spend from the pool → merchant on Arc Testnet
await spend(ctx, {
  amount: "10",                    // merchant receives exactly this
  from: {
    adapter,
    allocations: { amount: "10", chain: "Ethereum_Sepolia" },
  },
  to: {
    adapter,
    chain: "Arc_Testnet",          // always settles here
    recipientAddress: "0x...",
  },
});
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Payments | `@circle-fin/unified-balance-kit` v1.0.1 |
| Wallet adapter | `@circle-fin/adapter-viem-v2` |
| Multi-wallet | EIP-5749 (`window.ethereum.providers[]`) — supports MetaMask + Rabby simultaneously |
| Balance reading | Next.js API route (`/api/balance`) — server-side RPC, no CORS |
| Hosting | Vercel |

---

## Supported Source Chains (Testnet)

| Chain | Chain ID | USDC Contract |
|---|---|---|
| Ethereum Sepolia | `0xaa36a7` | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | `0x14a34` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Arbitrum Sepolia | `0x66eee` | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| Optimism Sepolia | `0xaa37dc` | `0x5fd84259d66Cd46123540766Be93DFE6D43130D9` |

**Settlement chain:** Arc Testnet (always)

---

## Fee Model

Circle charges a flat ~1 USDC protocol fee per spend() on testnet. The deposit must cover both the invoice amount and the fee:

```
deposit amount = invoice.amount + 1.05  (1 USDC fee + 0.05 buffer)
allocations.amount = invoice.amount     (Circle API rule: must equal spend amount)
```

The fee is drawn separately from the pool surplus — not from the merchant's received amount.

---

## CCTP Attestation

Cross-chain transfers require Circle's CCTP attestation, which takes 1–3 minutes. ArcPay handles this with an automatic retry loop:

```typescript
while (true) {
  try {
    result = await spend(ctx, { ... });
    break;
  } catch (e) {
    if (e.message.includes("BALANCE_INSUFFICIENT")) {
      await sleep(15_000); // retry every 15s
      continue;
    }
    throw e;
  }
}
```

The UI shows live elapsed time while waiting.

---

## Running Locally

### Prerequisites

- Node.js 18+
- MetaMask or Rabby wallet with testnet USDC
- Get testnet USDC from the [Circle Faucet](https://faucet.circle.com)

### Setup

```bash
git clone https://github.com/shumai1979/arcpay-v2.git
cd arcpay-v2
npm install
npm run dev
```

Open http://localhost:3000

No `.env` needed — balance API uses public RPC endpoints (PublicNode).

---

## Project Structure

```
arcpay-v2/
├── app/
│   ├── ArcPayApp.tsx        # Main app — wallet, invoice, payment flow
│   ├── page.tsx             # Next.js entry point
│   ├── layout.tsx           # Root layout
│   ├── globals.css          # Styles
│   └── api/
│       └── balance/
│           └── route.ts     # Server-side USDC balance reader (no CORS)
└── package.json
```

---

## Payment Flow (Step by Step)

1. **Merchant** connects wallet → creates invoice → shares payment link
2. **Payer** opens link → connects wallet → selects source chain (auto-selects chain with most USDC)
3. App reads USDC balances across all 4 testnets via server-side RPC
4. Payer clicks Pay → wallet switches to selected network
5. `deposit()` — USDC moves into Circle's unified pool (1 on-chain tx)
6. `spend()` retry loop — Circle bridges via CCTP to Arc Testnet
7. CCTP attestation completes in ~1-3 min → merchant receives USDC on Arc Testnet
8. Success screen shows transaction link on ArcScan

---

## Confirmed Transactions

| Test | Source | Destination | Explorer |
|---|---|---|---|
| Payment #1 | Ethereum Sepolia | Arc Testnet | [0x7de630...](https://testnet.arcscan.app/tx/0x7de630503341d20d1e117fb140da9ad8d2ccb39c5f1a2e70c44c9b3d58776d72) |

---

## Links

- [Circle Gateway Docs](https://developers.circle.com/gateway)
- [Arc Network](https://arc.network)
- [ArcScan Testnet Explorer](https://testnet.arcscan.app)
- [Circle Faucet](https://faucet.circle.com)
- [Unified Balance Kit on npm](https://www.npmjs.com/package/@circle-fin/unified-balance-kit)
