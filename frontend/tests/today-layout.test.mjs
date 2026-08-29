import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the desktop workout preview content-sized", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const desktopTodayStyles = styles.slice(styles.lastIndexOf("@media(min-width:1100px)"));

  assert.match(
    desktopTodayStyles,
    /\.today-session-card\.ui-card\{[^}]*grid-template-rows:auto auto auto auto;[^}]*min-height:0/,
  );
  assert.match(
    desktopTodayStyles,
    /\.today-exercise-preview\{[^}]*align-self:start;[^}]*display:block/,
  );
  assert.match(
    desktopTodayStyles,
    /\.today-exercise-preview ol\{[^}]*flex:none;[^}]*justify-content:initial/,
  );
  assert.doesNotMatch(desktopTodayStyles, /\.today-session-card\.ui-card\{[^}]*min-height:27rem/);
});

test("does not squeeze the Today dashboard beside the persistent navigation", async () => {
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const desktopTodayStyles = styles.slice(styles.lastIndexOf("@media(min-width:1100px)"));

  assert.match(
    desktopTodayStyles,
    /@media\(min-width:1100px\)\{[\s\S]*?\.today-primary-grid\{grid-template-columns:minmax\(0,1fr\)\}/,
  );
  assert.match(
    desktopTodayStyles,
    /@media\(min-width:1440px\)\{[\s\S]*?\.today-primary-grid\{grid-template-columns:minmax\(0,1\.75fr\) minmax\(17rem,\.62fr\)\}/,
  );
});
