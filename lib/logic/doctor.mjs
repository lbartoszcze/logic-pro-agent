// `node logic.mjs doctor`: everything a beat needs before Logic is touched,
// each check with what it found and, when something is missing, the one
// thing to do about it. Required checks fail the command; the rest inform.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GOLEM, golem, GolemFailure, LOGIC } from "../golem.mjs";
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
    return [finding("golem", false, error.message, `build it: cargo build --release in a golem checkout beside this one (${GOLEM})`, true)];
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
  return [
    finding("midi-send", true, MIDI_SEND, "", false),
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
