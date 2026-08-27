import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Exercise library — forgefit.space",
  description: "Browse 250 illustrated strength, bodybuilding, mobility, and cardio exercises.",
};

export default function ExercisesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="forgefit.space home"><BrandLockup /></Link>
        <nav aria-label="Exercise library navigation">
          <Link href="/">Home</Link>
          <Link className={styles.cta} href="/signin">Start training</Link>
        </nav>
      </header>
      <ExerciseLibrary />
    </main>
  );
}
