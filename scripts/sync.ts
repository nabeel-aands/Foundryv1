import { loadEnv } from "../src/lib/env";
import { runSync } from "../src/lib/sync";

loadEnv();
const only = process.argv.slice(2).filter((a) => !a.startsWith("-")) as import("../src/lib/fields").TableKey[];

runSync({ only: only.length ? only : undefined, log: (l) => console.log(l) })
  .then((snap) => {
    const line = Object.entries(snap.counts).map(([k, v]) => `${k} ${v}`).join(" · ");
    console.log(`\nSnapshot: ${line}`);
    if (snap.warnings.length) {
      console.log(`\n${snap.warnings.length} warning(s):`);
      for (const w of snap.warnings) console.log(`  - ${w}`);
    }
  })
  .catch((err) => {
    console.error(`\nSync failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
