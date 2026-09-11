import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fitai/ui/styles.css";
import "@fontsource-variable/manrope";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "forgefit.space";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Unified Agents — Build, test, and deploy AI agents",
    description: "Configure, test, deploy, and improve governed AI agents across Cloud and Edge runtimes.",
    icons: { icon: "/unified-favicon.svg", shortcut: "/unified-favicon.svg" },
    openGraph: { title: "Unified Agents", description: "One control plane for configurable AI agents.", images: [{ url: image, width: 1672, height: 941, alt: "Unified agent platform" }] },
    twitter: { card: "summary_large_image", title: "Unified Agents", description: "One control plane for configurable AI agents.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
