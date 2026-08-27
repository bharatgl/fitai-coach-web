import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Exercise library — forgefit.space",
  description: "Explore 302 animated bodybuilding, strength, mobility, and cardio movement demonstrations with practical form guidance.",
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
