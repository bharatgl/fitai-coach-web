import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "fitai-coach.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "FitAI Coach — Train with clarity",
    description: "A calm, browser-based fitness coach for structured training, thoughtful adjustments and privacy-aware live guidance.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "FitAI Coach", description: "Train with clarity.", images: [{ url: image, width: 1600, height: 900, alt: "FitAI Coach — Train with clarity" }] },
    twitter: { card: "summary_large_image", title: "FitAI Coach", description: "Train with clarity.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
