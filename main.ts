// Emberline — a threejs-fps-02 entry (Node 22, standard library only). The game is
// this directory's game/ folder: plain static files the browser loads as ES
// modules, with three.js from an import map. This program hands it in: it copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, using the vendored make.fun
// library.
//
// The game is a round-based tactical FPS: Ember vs Warden, five a side, on
// "Foundry Yard" (56x40 m, sites A "Furnace" and B "Depot", three lanes), rounds
// first to 5 (max 9), a buy phase with four weapons, a Shard grenade and Kevlar,
// and bots that push lanes, plant and defuse. README.md has the full rundown.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-threejs.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Pre-flight: the screenshots the dossier embeds must be real renders of this
// game, 3 or 4 of them, each a whole PNG or JPEG under 256 KiB. Fail loudly here
// instead of handing the gate a dossier built from a missing or oversized shot.
const shotsDir = join(here, "screenshots");
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith(".")).sort()
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`screenshots/: expected 3 or 4 shots, found ${shots.length}`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) throw new Error(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
  if (!/\.(png|jpe?g)$/i.test(name)) throw new Error(`screenshots/${name} is not a PNG or JPEG`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, "game"), join(out, "game"), { recursive: true });
mkdirSync(join(out, "screenshots"), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, "screenshots"), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

const dossierBytes = statSync(join(out, "dossier.json")).size;
if (dossierBytes > 1572864) throw new Error(`dossier.json is ${dossierBytes} bytes, over the 1.5 MiB cap`);
const dossier = JSON.parse(readFileSync(join(out, "dossier.json"), "utf8"));
if (!Array.isArray(dossier.images) || dossier.images.length !== shots.length) {
  throw new Error(`dossier.json embeds ${dossier.images?.length ?? 0} images, expected ${shots.length}`);
}
console.log(`Emberline handed in: ${shots.length} screenshots, dossier.json ${dossierBytes} bytes -> ${out}`);
