// `node logic.mjs beat [--style=…] [--key=…] [--bpm=…] [--bars=…]`: a beat from
// nothing to sound. doctor first; make-beat.mjs writes beat.mid; Logic opens it
// in the background; once the import shows its 4 tracks, each track gets its
// style's patch and the Stereo Out the Mastering Assistant; the project is
// bounced to Logic's Bounces folder and played through the speakers.
//
// A swap or the mastering that fails keeps Logic's default and is named, with
// golem's report, before the bounce; a bounce that fails ends the beat, since
// nothing is left to play. Nothing waits for a set time: each wait ends when
// what it waits for shows, and says meanwhile what it sees.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, watch } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as L from "./logic/control.mjs";
import { doctor } from "./logic/doctor.mjs";
import { DEFAULT_STYLE, STYLE_PACKS, stylePack } from "./logic/styles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAKE_BEAT = join(ROOT, "make-beat.mjs");
const BEAT_FILE = join(ROOT, "beat.mid");
// Logic's default Bounces folder.
const BOUNCES = join(homedir(), "Music", "Logic", "Bounces");
// The beat's parts: drums, chords, bass, melody (make-beat.mjs).
const BEAT_TRACKS = "4";

/** The deepest folder of `path` that exists, to watch for the rest to appear. */
function existingAncestor(path) {
  let folder = dirname(path);
  while (!existsSync(folder)) folder = dirname(folder);
  return folder;
}

/** Resolves once `path` exists, woken by file-system events, not by polling. */
export function fileAppears(path) {
  return new Promise((done) => {
    const watcher = watch(existingAncestor(path), { recursive: true }, () => {
      if (existsSync(path)) {
        watcher.close();
        done();
      }
    });
    // It may have appeared before the watch began.
    if (existsSync(path)) {
      watcher.close();
      done();
    }
  });
}

/** Runs `program` in this terminal; rejects naming it and its exit status when it fails. */
function run(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (status, signal) => {
      if (status === 0) return resolve();
      const how = signal ? `was stopped by ${signal}` : `exited ${status}`;
      reject(Object.assign(new Error(`${program} ${args.join(" ")} ${how}`), { status: status === null ? 1 : status }));
    });
  });
}

/** The style make-beat.mjs takes from `flags` (the last non-empty --style=), else the default; one without a pack is refused naming the styles. */
function styleOf(flags) {
  const given = flags.map((flag) => /^--style=(.+)$/.exec(flag)).filter((match) => match !== null).at(-1);
  const style = given === undefined ? DEFAULT_STYLE : given[1];
  if (!Object.hasOwn(STYLE_PACKS, style)) {
    throw new Error(`unknown style: ${style}; the styles are ${Object.keys(STYLE_PACKS).join(", ")} (node make-beat.mjs --list-styles describes them)`);
  }
  return style;
}

/** Runs `step`; a failure is shown and named in `skipped` instead of ending the beat. */
async function keepGoing(what, step, skipped) {
  try {
    await step();
  } catch (error) {
    console.error(error.message);
    skipped.push(Number.isInteger(error.status) ? `${what} (exit ${error.status})` : what);
  }
}

export async function beat(flags) {
  const style = styleOf(flags);
  const { swaps } = stylePack(style);
  await doctor();
  await run(process.execPath, [MAKE_BEAT, ...flags]);
  await L.open([BEAT_FILE]);
  await L.waitTracks([BEAT_TRACKS]);
  const skipped = [];
  for (const [hint, patch] of swaps) {
    await keepGoing(`swapping ${hint} for ${patch}`, () => L.swap([hint, patch]), skipped);
  }
  await keepGoing("the Mastering Assistant", () => L.master(), skipped);
  if (skipped.length > 0) console.error(`Kept Logic's defaults where a step failed: ${skipped.join("; ")}`);
  const name = `beat-${style}-${randomBytes(4).toString("hex")}`;
  await L.bounce([name]);
  console.log("Beat ready in Logic. 'node logic.mjs play' plays it there, without taking focus.");
  // The file appears when Logic starts writing it and is whole once Logic's bounce window has gone.
  const file = join(BOUNCES, `${name}.aif`);
  await fileAppears(file);
  await L.passthrough(["wait", "--gone", 'window[title^="Bounce"]']);
  console.log(`Audio rendered: ${file}`);
  console.log(`Playing ${file} (Ctrl+C to stop)...`);
  await run("/usr/bin/afplay", [file]);
}
