// `node logic.mjs doctor`: everything a beat needs before Logic is touched,
// each check with what it found and, when something is missing, the one
// thing to do about it. Required checks fail the command; the rest inform.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GOLEM, golem, GolemFailure, LOGIC, NOT_FOUND } from "../golem.mjs";
import { PROJECT_SELECTORS, TRACK_HEADER } from "./control.mjs";
import { listDestinations } from "./midi-control.mjs";

const LOGIC_APP = "/Applications/Logic Pro.app";
const LOGIC_PREFERENCES = join(homedir(), "Library", "Preferences", `${LOGIC}.plist`);
const SOUND_LIBRARY = "/Library/Application Support/Logic";
const MIDI_SEND = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "midi-send");

/** One finding: `required` ones that are not `ok` fail the doctor. */
function finding(name, ok, seen, fix, required) {
  return { name, ok, seen, fix, required };
}

async function golemFindings() {
  let version;
  try {
    version = await golem("version", [], { app: false });
  } catch (error) {
    return [finding("golem", false, error.message, `build it: kompilator build --release --manifest-path Cargo.toml in a golem checkout beside this one (${GOLEM})`, true)];
  }
  const found = [finding("golem", true, `${version} at ${GOLEM}`, "", true)];
  try {
    const report = await golem("doctor", [], { app: false });
    const recording = /screen recording\t(.*)/.exec(report);
    found.push(finding("accessibility", true, "granted to the program running this", "", true));
    found.push(finding("screen recording", recording !== null && recording[1] === "granted",
      recording === null ? "golem doctor did not say" : recording[1],
      "only screenshots need it: System Settings > Privacy & Security > Screen & System Audio Recording", false));
  } catch (error) {
    if (!(error instanceof GolemFailure)) throw error;
    found.push(finding("accessibility", false, error.report.message, error.report.fix, true));
  }
  return found;
}

function logicVersion() {
  const plist = join(LOGIC_APP, "Contents", "Info.plist");
  try {
    return execFileSync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", plist], { encoding: "utf8" }).trim();
  } catch (error) {
    return `version unreadable (${error.message.split("\n")[0]})`;
  }
}

async function logicFindings(golemWorks) {
  const installed = existsSync(LOGIC_APP);
  const found = [finding("Logic Pro", installed, installed ? `${logicVersion()} at ${LOGIC_APP}` : `nothing at ${LOGIC_APP}`,
    "install Logic Pro from the App Store", true)];
  found.push(finding("first launch", existsSync(LOGIC_PREFERENCES),
    existsSync(LOGIC_PREFERENCES) ? `preferences at ${LOGIC_PREFERENCES}` : "Logic has never been opened on this account",
    "open Logic once by hand and let it finish its first launch, so its windows and Library are what the commands expect", true));
  const library = existsSync(SOUND_LIBRARY) ? readdirSync(SOUND_LIBRARY) : [];
  found.push(finding("sound library", library.length > 0,
    library.length > 0 ? `${SOUND_LIBRARY}: ${library.join(", ")}` : `nothing at ${SOUND_LIBRARY}`,
    "Logic Pro > Sound Library > Download All Available Sounds, so swap finds its patches", false));
  if (!golemWorks) {
    found.push(finding("Logic running", false, "unknown: golem is needed to ask", "build golem first (above)", false));
    return found;
  }
  const apps = JSON.parse(await golem("apps", [], { app: false }));
  const running = apps.find((app) => app.bundleId === LOGIC);
  found.push(finding("Logic running", running !== undefined,
    running === undefined ? "not running" : `pid ${running.pid}`,
    "`node logic.mjs open <file>` starts it with a project, in the background", false));
  return found;
}

/** Why the midi-send binary lacks its source's last change, or null when it does not. */
function midiSendStale() {
  const git = (...args) => execFileSync("git", args, { cwd: dirname(MIDI_SEND), encoding: "utf8" }).trim();
  const changed = (file) => git("status", "--porcelain", "--", file) !== "";
  const committed = (file) => Number(git("log", "-1", "--format=%ct", "--", file));
  const source = `${MIDI_SEND}.swift`;
  if (changed(MIDI_SEND)) {
    // Rebuilt here: what counts is whether it was built after the source's last edit.
    return statSync(MIDI_SEND).mtimeMs >= statSync(source).mtimeMs ? null : "built here before its source's last edit";
  }
  if (changed(source)) return "its source has edits the committed binary was not built from";
  if (committed(source) > committed(MIDI_SEND)) return "its source was committed after the binary was";
  return null;
}

function midiFindings() {
  if (!existsSync(MIDI_SEND)) {
    return [finding("midi-send", false, `nothing at ${MIDI_SEND}`, `swiftc ${MIDI_SEND}.swift -o ${MIDI_SEND}`, false)];
  }
  let destinations;
  try {
    destinations = listDestinations();
  } catch (error) {
    return [finding("midi-send", false, error.message.split("\n")[0], `rebuild it: swiftc ${MIDI_SEND}.swift -o ${MIDI_SEND}`, false)];
  }
  const virtualIn = destinations.includes("Logic Pro Virtual In");
  // Outside a git checkout (a downloaded archive) the age cannot be told; that is said, not fatal.
  let stale;
  try {
    stale = midiSendStale();
  } catch (error) {
    stale = `cannot tell its age from git: ${error.message.split("\n")[0]}`;
  }
  const current = stale === null;
  return [
    finding("midi-send", current, current ? MIDI_SEND : stale,
      `rebuild it: swiftc ${MIDI_SEND}.swift -o ${MIDI_SEND}`, false),
    finding("Logic Pro Virtual In", virtualIn, virtualIn ? "listed" : "not listed (Logic lists it while it runs)",
      "start Logic; the MIDI commands (rtplay, midi-note, cc) reach it there", false),
  ];
}

export async function doctor() {
  const fromGolem = await golemFindings();
  const found = [...fromGolem, ...await logicFindings(fromGolem[0].ok), ...midiFindings()];
  for (const { name, ok, seen, fix } of found) {
    console.log(`${ok ? "ok     " : "missing"}\t${name}\t${seen}${ok ? "" : `\n\tfix: ${fix}`}`);
  }
  const blocking = found.filter((item) => item.required && !item.ok).map((item) => item.name);
  if (blocking.length > 0) {
    throw Object.assign(new Error(`Logic cannot be driven yet: ${blocking.join(", ")} (fixes above)`), { status: 1 });
  }
}

/** golem's observed lines, indented under the selector they belong to. */
const indented = (lines) => lines.map((line) => `\n\tobserved: ${line}`).join("");

/**
 * `node logic.mjs selectors-check`, with a project open: each selector the
 * commands rely on (control.mjs's PROJECT_SELECTORS) against Logic as it is
 * now, with how many elements it matches, and what golem saw instead when
 * it matches none. A selector that press or set acts on must match exactly
 * one element; the others at least one.
 */
export async function checkSelectors() {
  const wrong = [];
  for (const { what, selector, needs } of PROJECT_SELECTORS) {
    let matches;
    try {
      matches = JSON.parse(await golem("find", [selector])).length;
    } catch (error) {
      if (!(error instanceof GolemFailure) || error.status !== NOT_FOUND) throw error;
      wrong.push(what);
      console.log(`missing\t${what}\t${selector}${indented(error.report.observed)}`);
      continue;
    }
    if (needs === "one" && matches > 1) {
      wrong.push(what);
      console.log(`several\t${what}\t${selector} matches ${matches} elements, and press or set needs exactly one: \`node logic.mjs golem find '${selector}'\` lists them`);
      continue;
    }
    console.log(`ok     \t${what}\t${selector} (${matches} ${matches === 1 ? "element" : "elements"})`);
  }
  if (wrong.length > 0) {
    throw Object.assign(new Error(`${wrong.length} of control.mjs's selectors do not fit this Logic: ${wrong.join(", ")}. The Library ones need the Library open (View > Show Library); the rest need a project window. Compare with \`node logic.mjs golem tree\` and fix lib/logic/control.mjs`), { status: 1 });
  }
}

/** The elements a selector finds now, or none where golem answers "not there". */
async function found(selector) {
  try {
    return JSON.parse(await golem("find", [selector]));
  } catch (error) {
    if (error instanceof GolemFailure && error.status === NOT_FOUND) return [];
    throw error;
  }
}

/**
 * `node logic.mjs status`: what Logic shows now, one line each: whether it
 * runs, the project's file, then each element the commands rely on (the
 * track headers, Play, Cycle, Metronome Click, Tempo, the Library) with how
 * many show and the first one's value, or that it does not show.
 */
export async function status() {
  const apps = JSON.parse(await golem("apps", [], { app: false }));
  const logic = apps.find((app) => app.bundleId === LOGIC);
  if (logic === undefined) {
    console.log(`Logic\tnot running (open a project: node logic.mjs open <file>)`);
    return;
  }
  console.log(`Logic\trunning, pid ${logic.pid}${logic.active ? ", frontmost" : ", in the background"}`);
  const project = `window:has(${TRACK_HEADER}):first`;
  if ((await found(project)).length === 0) {
    console.log("project\tno window shows tracks");
  } else {
    let document;
    try {
      document = await golem("get", [project, "--attr", "AXDocument"]);
    } catch (error) {
      if (!(error instanceof GolemFailure && error.status === NOT_FOUND)) throw error;
      document = "no file yet (save names one)";
    }
    console.log(`project\t${document}`);
  }
  for (const { what, selector } of PROJECT_SELECTORS) {
    const elements = await found(selector);
    if (elements.length === 0) {
      console.log(`${what}\tnot showing`);
      continue;
    }
    const first = elements[0];
    const shown = first.value === undefined ? "" : `, value ${first.value}`;
    console.log(`${what}\t${elements.length} showing${shown}`);
  }
}
