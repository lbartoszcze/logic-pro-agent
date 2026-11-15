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

import { resolve } from "node:path";
import { golem, golemHolds, literal, LOGIC, q } from "../golem.mjs";

const TRACK_HEADER = 'layoutitem[label^="Track "]';
const SEARCH_FIELD = 'textfield[help^="Search field"]';
const PATCH_CATEGORY = 'statictext[help^="Patch category"]';
const LIBRARY_TITLE = 'statictext[id="_NS:137"]';
const BOUNCE_WINDOW = 'window[title^="Bounce"]';

const trackHeader = (hint) => `${TRACK_HEADER}[label*=${q(hint)}]`;
// Not the Library header, which names the loaded patch the same way.
const patchRow = (patch) => `statictext[id!="_NS:137"][value~=${q(`^(downloadable )?${literal(patch)}$`)}]`;

function need(value, usage) {
  if (!value) throw new Error(usage);
  return value;
}

/** Opens `file` in Logic without bringing Logic to the front, once a window shows. */
export function open([file]) {
  need(file, "open <path>");
  console.log(golem("launch", [LOGIC, resolve(file), "--timeout", "120"], { app: false }));
}

/** Whether golem can drive Logic: Accessibility must be granted to the program running it. */
export function doctor() {
  console.log(golem("doctor", [], { app: false }));
}

/** The project's tracks: number and name, in arrangement order. */
export function tracks() {
  const headers = JSON.parse(golem("find", [TRACK_HEADER, "--json"]));
  const listed = headers.flatMap((header) => {
    const parts = /^Track (\d+) [“"](.*)[”"]$/.exec(header.label ?? "");
    return parts ? [{ number: Number(parts[1]), name: parts[2] }] : [];
  });
  console.log(JSON.stringify(listed, null, 2));
}

/** Selects the one track whose name contains `hint`. */
export function select([hint]) {
  need(hint, "select <track-hint>");
  golem("press", [trackHeader(hint)]);
  console.log(`selected ${hint}`);
}

export function play() {
  console.log(golem("press", ['checkbox[title="Play"]']));
}

// Space toggles Logic's transport; Return goes to the project's start.
export function stop() {
  console.log(golem("key", ["space"]));
}

export function rewind() {
  console.log(golem("key", ["return"]));
}

export function cycle() {
  console.log(golem("press", ['checkbox[title="Cycle"]']));
}

export function metronome() {
  console.log(golem("press", ['checkbox[title="Metronome Click"]']));
}

// Logic's key commands: Z fits the arrangement, M mutes and S solos the selected track.
export function zoomFit() {
  console.log(golem("key", ["z"]));
}

export function mute([hint]) {
  select([need(hint, "mute <track-hint>")]);
  golem("key", ["m"]);
  console.log(`muted ${hint}`);
}

export function solo([hint]) {
  select([need(hint, "solo <track-hint>")]);
  golem("key", ["s"]);
  console.log(`soloed ${hint}`);
}

/** Sets the project tempo; golem reads the slider back to confirm it. */
export function tempo([bpm]) {
  const target = Number(need(bpm, "tempo <bpm>"));
  if (!Number.isInteger(target) || target < 30 || target > 300) throw new Error(`bpm out of range: ${bpm}`);
  console.log(golem("set", ['slider[label="Tempo"]', String(target)]));
}

/** Puts the Mastering Assistant on the Stereo Out. */
export function master() {
  console.log(golem("menu", ["Mix > Mastering Assistant…"]));
}

/** Types `query` into the Library's search field and lists what matches it. */
export function search(words) {
  const query = need(words.join(" "), "search <query>");
  showLibrary();
  golem("set", [SEARCH_FIELD, query]);
  console.log(golem("find", [`statictext[value*=${q(query)} i]`]));
}

/**
 * Loads `patch` on the track named by `hint` from the Library's category
 * browser. The Library lists a patch row only inside its category, and lists
 * rows below the visible ones lazily, so the swap opens categories until the
 * row shows, then double-clicks it, scrolling a page at a time, until the
 * Library's header names the patch.
 */
export function swap([hint, patch]) {
  need(hint && patch, "swap <track-hint> <patch>");
  select([hint]);
  showLibrary();
  golem("set", [SEARCH_FIELD, ""]);
  const row = patchRow(patch);
  if (!golemHolds("find", [row])) {
    const categories = JSON.parse(golem("find", [PATCH_CATEGORY, "--json"]));
    // A category without the patch also ends in "the row did not appear", so every category is
    // tried in the background before Logic is brought to the front for any of them.
    const open = (extra) => categories.some((_, index) =>
      golemHolds("click", [`${PATCH_CATEGORY}:nth(${index + 1})`, "--count", "2", "--expect", row, "--timeout", "1", ...extra]));
    const opened = open([]) || open(["--foreground"]);
    if (!opened) {
      throw new Error(`no Library entry for ${patch} in any of ${hint}'s ${categories.length} categories`);
    }
  }
  const loaded = `${LIBRARY_TITLE}[value*=${q(patch)}]`;
  for (let page = 0; page < 5; page++) {
    // A row that offers AXScrollToVisible scrolls itself into view; one that does not waits for the page scroll below.
    golemHolds("press", [`${row}[action="AXScrollToVisible"]`, "--action", "AXScrollToVisible"]);
    if (doubleClick(row, loaded, "2")) {
      console.log(`loaded ${patch} on ${hint}`);
      return;
    }
    // golem scroll pages the row's own list: its nearest ancestor that scrolls by page.
    golem("scroll", [row]);
  }
  throw new Error(`double-clicked ${patch} for ${hint}, but the Library header never named it`);
}

/**
 * Double-clicks `target` until `outcome` matches: in the background first,
 * then once with Logic brought to the front for the click and the previous
 * app put back (golem click --foreground), for a list Logic only acts on when
 * its window is key. False when the target is out of view or neither click
 * brought the outcome.
 */
function doubleClick(target, outcome, timeout) {
  const click = [target, "--count", "2", "--expect", outcome, "--timeout", timeout];
  return golemHolds("click", click) || golemHolds("click", [...click, "--foreground"]);
}

const NAME_FIELD = "textfield[id*=saveAsNameTextField]";

/**
 * Confirms the save panel holding the name field: the default button of the
 * innermost window or sheet around the field, pressed through Accessibility,
 * whatever its title (Save, Bounce) or language; Return in the field when the
 * panel names no default button.
 */
function confirmSavePanel() {
  const panelDefault = `*[role~="^AX(Sheet|Window)$"]:has(${NAME_FIELD}):last button[default=true]`;
  const done = ["--expect-gone", NAME_FIELD, "--timeout", "10"];
  if (golemHolds("find", [panelDefault])) {
    golem("press", [panelDefault, ...done]);
  } else {
    golem("key", ["return", "--focus", NAME_FIELD, ...done]);
  }
}

/** Saves the project; a first save names it `name` in the Save dialog. */
export function save([name = "logic-pro-agent-project"]) {
  golem("key", ["cmd+s"]);
  if (!golemHolds("wait", [NAME_FIELD, "--timeout", "1.5"])) {
    console.log("saved (the project already had a file)");
    return;
  }
  golem("set", [NAME_FIELD, name]);
  confirmSavePanel();
  console.log(`saved as ${name}`);
}

/**
 * Bounces the project to `name`.aif in Logic's Bounces folder: File > Bounce >
 * Project or Section…, the settings window's confirming button (OK in the
 * Logic the cua driver met, Bounce in the one the menu driver met), then the
 * name and Bounce on the save window.
 */
export function bounce([name = "logic-pro-agent-beat"]) {
  golem("menu", ["File > Bounce > Project or Section…"]);
  const confirm = `${BOUNCE_WINDOW} button[title~="^(OK|Bounce)$"]`;
  golem("wait", [confirm, "--timeout", "10"]);
  const nameField = `${BOUNCE_WINDOW} ${NAME_FIELD}`;
  golem("press", [confirm, "--expect", nameField, "--timeout", "10"]);
  golem("set", [nameField, name]);
  confirmSavePanel();
  console.log(`bouncing ${name}.aif (Logic's Bounces folder, usually ~/Music/Logic/Bounces/)`);
}

/** Bounces in place: `regions`, `tracks`, or `replace` (and replace all tracks). */
export function bounceInPlace([scope]) {
  const leaf = { regions: "Regions in Place…", tracks: "Tracks in Place…", replace: "And Replace All Tracks…" }[scope];
  if (!leaf) throw new Error(`bounce-in-place <regions|tracks|replace>; got ${JSON.stringify(scope)}`);
  golem("menu", [`File > Bounce > ${leaf}`]);
  golem("wait", ['button[title="Bounce"]', "--timeout", "10"]);
  golem("press", ['button[title="Bounce"]', "--expect-gone", 'button[title="Bounce"]', "--timeout", "10"]);
  console.log(`bounced ${scope} in place`);
}

/** Opens the Library (Y) when its search field is not showing. */
function showLibrary() {
  if (golemHolds("find", [SEARCH_FIELD])) return;
  golem("key", ["y", "--expect", SEARCH_FIELD]);
}

/** Keys to Logic: `key cmd+s`, `key space`. */
export function key(keys) {
  need(keys.length, "key <key>...");
  console.log(golem("key", keys));
}

/** Text typed into Logic's focused field. */
export function type(words) {
  console.log(golem("type", [need(words.join(" "), "type <text>")]));
}

/** A menu item by path: `menu File Save` or `menu "File > Save"`. */
export function menu(path) {
  need(path.length, 'menu <Top> [<Sub>...] <Leaf>   e.g. menu File Save');
  console.log(golem("menu", path));
}

/** Any golem command against Logic: `golem tree`, `golem find 'button[title=Play]'`, `golem doctor`. */
export function passthrough([command, ...args]) {
  need(command, "golem <command> [arguments]   (golem help lists them)");
  console.log(golem(command, args, { app: !["apps", "launch", "doctor", "help", "version"].includes(command) }));
}
