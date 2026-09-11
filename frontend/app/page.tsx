import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";
import { productFlags } from "@/lib/product-flags.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unified — Build, test, and deploy agents across Cloud and Edge",
  description: "One control plane to shape, review, test, deploy, and improve AI agents across managed Cloud and offline-ready Edge runtimes.",
  icons: { icon: "/unified-favicon.svg", shortcut: "/unified-favicon.svg" },
  openGraph: {
    title: "Unified agent platform",
    description: "Build with Agent Studio, deploy to Cloud, and prepare for governed Edge runtimes.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Unified agent platform",
    description: "Build, test, and operate agents across Cloud and Edge from one control plane.",
  },
};

export default function Home() {
  const flags = productFlags();
  return <LandingPage showCareer={flags.showCareer} showFitness={flags.showFitness} />;
}
