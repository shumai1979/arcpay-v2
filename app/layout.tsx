import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArcPay — Cross-Chain USDC Payments",
  description: "Accept USDC from any chain via Circle Unified Balance Kit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
