import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/BrandLockup";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { productFlags } from "@/lib/product-flags.server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Exercise library — forgefit.space",
  description: "Explore 302 animated bodybuilding, strength, mobility, and cardio movement demonstrations with practical form guidance.",
};

export default function ExercisesPage() {
  // The library is a Fitness support surface, so it follows the same parked flag.
  if (!productFlags().showFitness) redirect("/");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="forgefit.space home"><BrandLockup /></Link>
        <nav aria-label="Exercise library navigation">
          <Link href="/fitness">FitAI Coach</Link>
          <Link className={styles.cta} href="/signin?callbackUrl=/fitness">Start training</Link>
        </nav>
      </header>
      <ExerciseLibrary />
    </main>
  );
}
