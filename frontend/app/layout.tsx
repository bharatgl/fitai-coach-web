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
    title: "forgefit.space — Personal AI specialists",
    description: "Focused AI specialists for fitness, interview practice, resume improvement, and the goals you build next.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "forgefit.space", description: "One space. Focused AI specialists for real goals.", images: [{ url: image, width: 1672, height: 941, alt: "forgefit.space personal AI specialists" }] },
    twitter: { card: "summary_large_image", title: "forgefit.space", description: "One space. Focused AI specialists for real goals.", images: [image] },
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
