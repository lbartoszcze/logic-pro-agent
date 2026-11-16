// Logic Pro, driven through golem with Logic in the background: tracks,
// transport, patch swaps, mastering, saving and bouncing. Each export is one
// logic.mjs command.
//
// Element names are the ones Logic's accessibility tree shows: a track header
// is an AXLayoutItem labelled `Track 2 “Pulse Bass”`, the transport's Play an
// AXCheckBox titled Play, the Library's search field has help starting
// "Search field", a patch row is an AXStaticText whose value is the patch
// name (prefixed "downloadable " until the patch is installed), and the
// Library header showing the loaded patch has identifier _NS:137.
//
// Nothing here waits for a set time: every wait is golem's, which ends when
// the outcome shows or Logic quits, and says meanwhile what it sees.

import { resolve } from "node:path";
import { golem, GolemFailure, golemHolds, golemInTerminal, literal, LOGIC, q } from "../golem.mjs";

const TRACK_HEADER = 'layoutitem[label^="Track "]';
const SEARCH_FIELD = 'textfield[help^="Search field"]';
const LIBRARY_TITLE = 'statictext[id="_NS:137"]';
const BOUNCE_WINDOW = 'window[title^="Bounce"]';
const NAME_FIELD = "textfield[id*=saveAsNameTextField]";
const TEMPO = 'slider[label="Tempo"]';
const checkbox = (title) => `checkbox[title=${q(title)}]`;

/**
 * The selectors the commands press, set or read in a project window, for
 * `selectors-check`: each with how many elements it must match (`one` for
 * what press and set act on, `some` for what is listed).
 */
export const PROJECT_SELECTORS = [
  { what: "track headers", selector: TRACK_HEADER, needs: "some" },
  { what: "Play", selector: checkbox("Play"), needs: "one" },
  { what: "Cycle", selector: checkbox("Cycle"), needs: "one" },
  { what: "Metronome Click", selector: checkbox("Metronome Click"), needs: "one" },
  { what: "Tempo slider", selector: TEMPO, needs: "one" },
  { what: "Library search field (Library open)", selector: SEARCH_FIELD, needs: "one" },
  { what: "Library header naming the loaded patch (Library open)", selector: LIBRARY_TITLE, needs: "one" },
];

const trackHeader = (hint) => `${TRACK_HEADER}[label*=${q(hint)}]`;
// Not the Library header, which names the loaded patch the same way.
const patchRow = (patch) => `statictext[id!="_NS:137"][value~=${q(`^(downloadable )?${literal(patch)}$`)}]`;

/** What to do in Logic's terms, by golem's cause, after golem's own fix. */
const ADVICE = {
  "selector.no-match": "Logic 13 may name this element differently from control.mjs: `node logic.mjs selectors-check` checks every selector the commands rely on, and `node logic.mjs golem tree` shows what Logic shows",
  "selector.many": "control.mjs's selector matches several of Logic's elements: `node logic.mjs golem find '<selector>'` lists them",
  "menu.no-item": "this Logic may have renamed or moved the item: `node logic.mjs wrappers-check` checks every wrapper's menu path at once, and `node logic.mjs golem menus` lists Logic's items",
  "menu.disabled": "Logic disables the item in its current state: select a track or region first, or open a project",
  "set.out-of-range": "Logic's control reports other bounds than control.mjs allows (tempo: 5 to 990, from Apple's guide); the observed lines give Logic's own, and nothing was set",
  "app.not-running": "start Logic with a project: `node logic.mjs open <file>`",
  "app.quit": "Logic quit; open the project again with `node logic.mjs open <file>`",
  "permission.accessibility": "`node logic.mjs doctor` shows what is missing and how to grant it",
};

/** A Logic step that did not happen, with golem's report under it. */
export class LogicFailure extends Error {
  constructor(what, failure) {
    const { report } = failure;
    const lines = [`logic: ${what} did not happen`, `golem: ${report.message}`];
    for (const seen of report.observed) lines.push(`observed: ${seen}`);
    lines.push(`fix: ${report.fix}`);
    if (ADVICE[report.cause]) lines.push(`fix: ${ADVICE[report.cause]}`);
    lines.push(`cause: ${report.cause} (exit ${report.exit}, ${report.kind})`);
    super(lines.join("\n"));
    this.status = failure.status;
  }
}

/** Runs one Logic step; a golem failure is reported in Logic's terms. */
export async function step(what, run) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GolemFailure) throw new LogicFailure(what, error);
    throw error;
  }
}

/** `value` when given, else the usage error naming the command's usage and what is missing. */
function need(value, usage, what) {
  if (!value) throw new Error(`usage: node logic.mjs ${usage}\n${what} is missing`);
  return value;
}

/** Opens `file` in Logic without bringing Logic to the front, once a window shows. */
export async function open([file]) {
  need(file, "open <path>", "the project's path");
  const app = JSON.parse(await step(`opening ${file}`, () => golem("launch", [LOGIC, resolve(file)], { app: false })));
  console.log(`opened ${file} in ${app.name} (pid ${app.pid}), in the background`);
}

/** The project's tracks: number and name, in arrangement order. */
export async function tracks() {
  const headers = JSON.parse(await step("listing the tracks", () => golem("find", [TRACK_HEADER])));
  const listed = [];
  for (const header of headers) {
    const parts = /^Track (\d+) [“"](.*)[”"]$/.exec(header.label);
    if (parts) listed.push({ number: Number(parts[1]), name: parts[2] });
    // A label in another form (a Logic version naming headers differently) is said, not dropped.
    else console.error(`a track header's label is not Track <number> “<name>”, so it is left out: ${JSON.stringify(header.label)}`);
  }
  console.log(JSON.stringify(listed, null, 2));
}

/** Waits, with no deadline, until the project shows at least `count` tracks (an import finishing). */
export async function waitTracks([count]) {
  const wanted = Number(need(count, "wait-tracks <count>", "the number of tracks"));
  if (!Number.isInteger(wanted) || wanted < 1) throw new Error(`usage: node logic.mjs wait-tracks <count>\nthe number of tracks must be a whole number from 1; got ${JSON.stringify(count)}`);
  await step(`waiting for ${wanted} tracks`, () => golem("wait", [`${TRACK_HEADER}:nth(${wanted})`]));
  console.log(`${wanted} tracks`);
}

/** Selects the one track whose name contains `hint`. */
export async function select([hint]) {
  need(hint, "select <track-hint>", "a word of the track's name");
  await step(`selecting the track named like ${hint}`, () => golem("press", [trackHeader(hint)]));
  console.log(`selected ${hint}`);
}

const pressCheckbox = async (title) => {
  await step(`pressing ${title}`, () => golem("press", [checkbox(title)]));
  console.log(`pressed ${title}`);
};
export const play = () => pressCheckbox("Play");
export const cycle = () => pressCheckbox("Cycle");
export const metronome = () => pressCheckbox("Metronome Click");

// Logic's key commands: Space toggles the transport, Return goes to the project's
// start, Z fits the arrangement, M mutes and S solos the selected track.
const pressKey = (key, what) => step(what, () => golem("key", [key]));
const keyCommand = async (key, what, done) => {
  await pressKey(key, what);
  console.log(done);
};
export const stop = () => keyCommand("space", "stopping the transport", "transport toggled (Space)");
export const rewind = () => keyCommand("return", "going to the project's start", "at the project's start");
export const zoomFit = () => keyCommand("z", "fitting the arrangement", "arrangement fitted");

export async function mute([hint]) {
  await select([need(hint, "mute <track-hint>", "a word of the track's name")]);
  await pressKey("m", `muting ${hint}`);
  console.log(`muted ${hint}`);
}

export async function solo([hint]) {
  await select([need(hint, "solo <track-hint>", "a word of the track's name")]);
  await pressKey("s", `soloing ${hint}`);
  console.log(`soloed ${hint}`);
}

// Logic's project tempo runs from 5 to 990 bpm: https://support.apple.com/guide/logicpro/set-the-project-tempo-lgcpce0ff024/mac
const TEMPO_RANGE = { low: 5, high: 990 };

/** Sets the project tempo; golem reads the slider back, and refuses a tempo Logic clamps. */
export async function tempo([bpm]) {
  const target = Number(need(bpm, "tempo <bpm>", "the tempo in beats per minute"));
  if (!(target >= TEMPO_RANGE.low && target <= TEMPO_RANGE.high)) {
    throw new Error(`usage: node logic.mjs tempo <bpm>\nthe tempo must be a number of beats per minute from ${TEMPO_RANGE.low} to ${TEMPO_RANGE.high}, Logic's range, such as 92 or 120.5; got ${JSON.stringify(bpm)}`);
  }
  const done = JSON.parse(await step(`setting the tempo to ${target}`, () => golem("set", [TEMPO, String(target)])));
  console.log(`tempo ${done.value}`);
}

const MASTERING_ASSISTANT = ["Mix", "Mastering Assistant…"];
const BOUNCE_PROJECT = ["File", "Bounce", "Project or Section…"];
const BOUNCE_IN_PLACE = { regions: "Regions in Place…", tracks: "Tracks in Place…", replace: "And Replace All Tracks…" };

/** The menu items the commands here press (not wrappers), for `wrappers-check`. */
export const CONTROL_MENUS = [
  { what: "master", path: MASTERING_ASSISTANT },
  { what: "bounce", path: BOUNCE_PROJECT },
  ...Object.entries(BOUNCE_IN_PLACE).map(([scope, leaf]) => ({ what: `bounce-in-place ${scope}`, path: ["File", "Bounce", leaf] })),
];

/** Puts the Mastering Assistant on the Stereo Out and waits until its window shows. */
export async function master() {
  await step("opening the Mastering Assistant", () =>
    golem("menu", [MASTERING_ASSISTANT.join(" > "), "--expect", '*[title*="Mastering Assistant"]']));
  console.log("Mastering Assistant on the Stereo Out");
}

/** Types `query` into the Library's search field and lists what matches it. */
export async function search(words) {
  const query = need(words.join(" "), "search <query>", "the words to search the Library for");
  await showLibrary();
  await step(`searching the Library for ${query}`, () => golem("set", [SEARCH_FIELD, query]));
  const found = JSON.parse(await step(`listing the Library's matches for ${query}`, () => golem("find", [`statictext[value*=${q(query)} i]`])));
  for (const row of found) console.log(row.value);
}

/**
 * Loads `patch` on the track named by `hint`: searches the Library for it,
 * waits until its row shows, brings the row into view, and double-clicks it
 * with Logic in front for that moment (a list Logic only acts on when its
 * window is key), until the Library's header names the patch.
 */
export async function swap([hint, patch]) {
  need(hint, "swap <track-hint> <patch>", "a word of the track's name");
  need(patch, "swap <track-hint> <patch>", "the patch's name");
  await select([hint]);
  await showLibrary();
  const row = patchRow(patch);
  const loaded = `${LIBRARY_TITLE}[value*=${q(patch)}]`;
  await step(`searching the Library for ${patch}`, () => golem("set", [SEARCH_FIELD, patch]));
  await step(`finding ${patch} in the Library`, () => golem("wait", [row]));
  // A row that offers AXScrollToVisible scrolls itself into view; one in view already needs nothing.
  await step(`scrolling ${patch} into view`, () => golemHolds("press", [`${row}[action="AXScrollToVisible"]`, "--action", "AXScrollToVisible"]));
  await step(`loading ${patch} on ${hint}`, () => golem("click", [row, "--count", "2", "--foreground", "--expect", loaded]));
  console.log(`loaded ${patch} on ${hint}`);
}

/**
 * Confirms the save panel holding the name field: the default button of the
 * innermost window or sheet around the field, pressed through Accessibility,
 * whatever its title (Save, Bounce) or language; Return in the field when the
 * panel names no default button.
 */
async function confirmSavePanel() {
  const panelDefault = `*[role~="^AX(Sheet|Window)$"]:has(${NAME_FIELD}):last button[default=true]`;
  const done = ["--expect-gone", NAME_FIELD];
  if (await step("finding the save panel's default button", () => golemHolds("find", [panelDefault]))) {
    await step("confirming the save panel", () => golem("press", [panelDefault, ...done]));
  } else {
    await step("confirming the save panel with Return", () => golem("key", ["return", "--focus", NAME_FIELD, ...done]));
  }
}

/**
 * Saves the project. A project with no file yet (its window reports no
 * AXDocument) gets the Save panel, named `name`; one with a file is saved in place.
 */
export async function save([name = "logic-pro-agent-project"]) {
  // The project window is the one holding the tracks; the front window may be the Mastering Assistant or a plug-in.
  const hasFile = await step("checking whether the project has a file", () =>
    golemHolds("get", [`window:has(${TRACK_HEADER}):first`, "--attr", "AXDocument"]));
  if (hasFile) {
    await step("saving the project", () => golem("key", ["cmd+s"]));
    console.log("saved (the project already had a file)");
    return;
  }
  await step("opening the Save panel", () => golem("key", ["cmd+s", "--expect", NAME_FIELD]));
  await step(`naming the project ${name}`, () => golem("set", [NAME_FIELD, name]));
  await confirmSavePanel();
  console.log(`saved as ${name}`);
}

/**
 * Bounces the project to `name`.aif in Logic's Bounces folder: File > Bounce >
 * Project or Section…, the settings window's confirming button (OK in the
 * Logic the cua driver met, Bounce in the one the menu driver met), then the
 * name and the save panel's default button.
 */
export async function bounce([name = "logic-pro-agent-beat"]) {
  const confirm = `${BOUNCE_WINDOW} button[title~="^(OK|Bounce)$"]`;
  const nameField = `${BOUNCE_WINDOW} ${NAME_FIELD}`;
  await step("opening the Bounce window", () => golem("menu", [BOUNCE_PROJECT.join(" > "), "--expect", confirm]));
  await step("confirming the bounce settings", () => golem("press", [confirm, "--expect", nameField]));
  await step(`naming the bounce ${name}`, () => golem("set", [nameField, name]));
  await confirmSavePanel();
  console.log(`bouncing ${name}.aif (Logic's Bounces folder, usually ~/Music/Logic/Bounces/)`);
}

/** Bounces in place: `regions`, `tracks`, or `replace` (and replace all tracks). */
export async function bounceInPlace([scope]) {
  if (!Object.hasOwn(BOUNCE_IN_PLACE, scope)) {
    throw new Error(`usage: node logic.mjs bounce-in-place <${Object.keys(BOUNCE_IN_PLACE).join("|")}>\nthe scope is ${scope === undefined ? "missing" : `${JSON.stringify(scope)}, none of those`}`);
  }
  const leaf = BOUNCE_IN_PLACE[scope];
  const confirm = 'button[title="Bounce"]';
  await step(`opening Bounce ${leaf}`, () => golem("menu", [`File > Bounce > ${leaf}`, "--expect", confirm]));
  await step(`bouncing ${scope} in place`, () => golem("press", [confirm, "--expect-gone", confirm]));
  console.log(`bounced ${scope} in place`);
}

/** Opens the Library (Y) when its search field is not showing. */
async function showLibrary() {
  if (await step("looking for the Library", () => golemHolds("find", [SEARCH_FIELD]))) return;
  await step("showing the Library", () => golem("key", ["y", "--expect", SEARCH_FIELD]));
}

/** Keys to Logic: `key cmd+s`, `key space`. */
export async function key(keys) {
  need(keys.length, "key <key>...", "a key, such as space or cmd+s");
  await step(`pressing ${keys.join(" ")}`, () => golem("key", keys));
  console.log(`pressed ${keys.join(" ")}`);
}

/** Text typed into Logic's focused field. */
export async function type(words) {
  const text = need(words.join(" "), "type <text>", "the text to type");
  const done = JSON.parse(await step("typing into Logic", () => golem("type", [text])));
  console.log(`typed ${done.characters} characters`);
}

/** A menu item by path: `menu File Save` or `menu "File > Save"`. */
export async function menu(path) {
  need(path.length, "menu <Top> [<Sub>...] <Leaf>   e.g. menu File Save", "the menu item's path");
  await step(`pressing the menu item ${path.join(" > ")}`, () => golem("menu", path));
  console.log(`pressed ${path.join(" > ")}`);
}

/** Any golem command against Logic, in this terminal: `golem tree`, `golem find 'button[title=Play]'`. */
export async function passthrough([command, ...args]) {
  need(command, "golem <command> [arguments]   (golem help lists them)", "the golem command");
  const status = await golemInTerminal(command, args, { app: !["apps", "launch", "doctor", "errors", "help", "version"].includes(command) });
  if (status !== 0) throw Object.assign(new Error(`golem ${command} exited ${status}`), { status });
}
