import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fitai/ui/styles.css";
import "@fontsource-variable/manrope";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "forgefit.space";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "forgefit.space — Adaptive training intelligence",
    description: "Adaptive workout programming, private live movement guidance, and account-aware AI coaching.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "forgefit.space", description: "Build strength. Track everything.", images: [{ url: image, width: 1672, height: 941, alt: "forgefit.space adaptive training system" }] },
    twitter: { card: "summary_large_image", title: "forgefit.space", description: "Build strength. Track everything.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
