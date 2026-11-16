// Named wrappers turning the 432-command Logic Pro menu catalog
// (references/logic-menus.txt) into ergonomic CLI verbs. Analog of
// final-cut-pro-agent lib/fcp-wrappers.mjs.
//
// Every wrapper presses its menu item through golem (lib/golem.mjs): an
// Accessibility action on Logic Pro, with no menu opening, no cursor moving
// and Logic left in the background. File > Open… and File > Save are not
// here: logic.mjs's own open and save commands also open the file or name it.

import { golem, step } from "../golem.mjs";
import { CONTROL_MENUS } from "./control.mjs";

/** The command pressing menu item `path`; it carries the path for `checkWrappers`. */
function menu(path, label = path.join(" → ")) {
  const item = path.join(" > ");
  const press = async () => {
    await step(`pressing the menu item ${item}`, () => golem("menu", [item]));
    console.log(label);
  };
  press.menuPath = path;
  return press;
}

/** A title as golem compares menu titles: `...` is `…`, outer blanks dropped. */
const normal = (title) => title.replaceAll("...", "…").trim();
const loose = (title) => normal(title).toLowerCase();
const bare = (title) => loose(title).replaceAll("…", "");

/**
 * How `wanted` stands among Logic's menu items (`paths`, from golem menus):
 * "exact", "loose" when golem would still press it (case or ellipsis aside),
 * or the items it may have become, by the same last title elsewhere or by
 * every word of it.
 */
export function lookUp(wanted, paths) {
  const joined = (path, form) => path.map(form).join(" > ");
  if (paths.some((path) => joined(path, normal) === joined(wanted, normal))) return { found: "exact" };
  if (paths.filter((path) => joined(path, bare) === joined(wanted, bare)).length === 1) return { found: "loose" };
  const leaf = bare(wanted.at(-1));
  const words = leaf.split(/\s+/).filter((word) => word.length > 0);
  const moved = paths.filter((path) => bare(path.at(-1)) === leaf);
  const similar = paths.filter((path) => words.every((word) => bare(path.at(-1)).includes(word)));
  return { found: "missing", candidates: (moved.length > 0 ? moved : similar).map((path) => path.join(" > ")) };
}

/**
 * `node logic.mjs wrappers-check`: every wrapper's menu path, and those the
 * commands in control.mjs press (master, bounce, bounce-in-place), against
 * Logic's menus as golem reads them now, so a Logic version that renamed or
 * moved an item is known before it is pressed. Missing ones fail the check.
 */
export async function checkWrappers() {
  const entries = JSON.parse(await step("reading Logic's menus", () => golem("menus")));
  const paths = entries.map((entry) => entry.path);
  const checked = [
    ...Object.entries(WRAPPERS).map(([name, press]) => ({ name, path: press.menuPath, file: "lib/logic/wrappers.mjs" })),
    ...CONTROL_MENUS.map(({ what, path }) => ({ name: what, path, file: "lib/logic/control.mjs" })),
  ];
  const missing = [];
  let loosely = 0;
  for (const { name, path, file } of checked) {
    const result = lookUp(path, paths);
    if (result.found === "loose") loosely += 1;
    if (result.found !== "missing") continue;
    missing.push(`${name} (${file})`);
    const shown = result.candidates.length > 0 ? `; Logic has ${result.candidates.join(" | ")}` : "; nothing alike";
    console.log(`missing\t${name}\t${path.join(" > ")}${shown}`);
  }
  const total = checked.length;
  console.log(`${total - missing.length} of ${total} menu paths name an item in Logic's menus (${loosely} only up to case or ellipsis, which golem still presses)`);
  if (missing.length > 0) {
    throw Object.assign(new Error(`${missing.length} menu paths name no item of this Logic: ${missing.join(", ")}; fix them where named`), { status: 1 });
  }
}

export const WRAPPERS = {
  // ---- Track ----
  "new-audio-track": menu(["Track", "New Audio Track"]),
  "new-instrument-track": menu(["Track", "New Software Instrument Track"]),
  "new-drummer-track": menu(["Track", "New Drummer Track"]),
  "new-midi-track": menu(["Track", "New External MIDI Track"]),
  "new-tracks": menu(["Track", "New Tracks…"]),
  "rename-track": menu(["Track", "Rename Track"]),
  "delete-track": menu(["Track", "Delete Track"]),
  "delete-unused-tracks": menu(["Track", "Delete Unused Tracks"]),
  "create-track-stack": menu(["Track", "Create Track Stack…"]),
  "flatten-stack": menu(["Track", "Flatten Stack"]),
  "global-arrangement-track": menu(["Track", "Global Tracks", "Arrangement Track"]),
  "global-marker-track": menu(["Track", "Global Tracks", "Marker Track"]),
  "global-tempo-track": menu(["Track", "Global Tracks", "Tempo Track"]),
  "global-signature-track": menu(["Track", "Global Tracks", "Signature Track"]),
  "global-transposition-track": menu(["Track", "Global Tracks", "Transposition Track"]),

  // ---- Edit (Logic-specific subset) ----
  cut: menu(["Edit", "Cut"], "cut"),
  copy: menu(["Edit", "Copy"], "copy"),
  paste: menu(["Edit", "Paste"], "paste"),
  delete: menu(["Edit", "Delete"], "delete"),
  "select-all": menu(["Edit", "Select All"]),
  undo: menu(["Edit", "Undo"], "undo"),
  redo: menu(["Edit", "Redo"], "redo"),
  "undo-history": menu(["Edit", "Undo History…"]),

  // ---- Mix / automation ----
  "show-automation": menu(["Mix", "Show Automation"]),
  "automation-settings": menu(["Mix", "Automation Settings…"]),
  "auto-1pt-region-borders": menu(["Mix", "Create Track Automation", "Create 1 Automation Point at Region Borders"]),
  "auto-2pt-region-borders": menu(["Mix", "Create Track Automation", "Create 2 Automation Points at Region Borders"]),
  "auto-volume-fadeout": menu(["Mix", "Create Track Automation", "Create Volume Fade-Out on Main Output"]),
  "auto-track-to-region": menu(["Mix", "Convert Automation", "Convert All Track Automation to Region Automation"]),
  "auto-region-to-track": menu(["Mix", "Convert Automation", "Convert All Region Automation to Track Automation"]),
  "auto-delete-visible": menu(["Mix", "Delete Automation", "Delete Visible Automation on Selected Tracks"]),
  "auto-delete-all-selected": menu(["Mix", "Delete Automation", "Delete All Automation on Selected Tracks"]),
  "auto-delete-redundant": menu(["Mix", "Delete Automation", "Delete Redundant Automation Points"]),
  "auto-quick-access": menu(["Mix", "Enable Automation Quick Access"]),

  // ---- Navigate / markers / locators ----
  "go-position": menu(["Navigate", "Go To", "Position…"]),
  "go-left-locator": menu(["Navigate", "Go To", "Left Locator"]),
  "go-right-locator": menu(["Navigate", "Go To", "Right Locator"]),
  "go-selection-start": menu(["Navigate", "Go To", "Selection Start"]),
  "go-selection-end": menu(["Navigate", "Go To", "Selection End"]),
  "go-next-marker": menu(["Navigate", "Go To", "Next Marker"]),
  "go-prev-marker": menu(["Navigate", "Go To", "Previous Marker"]),
  "scroll-to-selection": menu(["Navigate", "Scroll to Selection"]),
  "set-locators-cycle": menu(["Navigate", "Set Locators by Selection and Enable Cycle"]),
  "set-rounded-locators-cycle": menu(["Navigate", "Set Rounded Locators by Selection and Enable Cycle"]),
  "locators-forward": menu(["Navigate", "Move Locators Forward by Cycle Length"]),
  "locators-backward": menu(["Navigate", "Move Locators Backwards by Cycle Length"]),
  "create-marker": menu(["Navigate", "Create Marker"]),
  "rename-marker": menu(["Navigate", "Rename Marker"]),
  "delete-marker": menu(["Navigate", "Delete Marker at Playhead Position"]),
  "open-marker-list": menu(["Navigate", "Open Marker List"]),

  // ---- Record ----
  "count-in-none": menu(["Record", "Count-in", "None"]),
  "count-in-1bar": menu(["Record", "Count-in", "1 Bar"]),
  "count-in-2bar": menu(["Record", "Count-in", "2 Bars"]),
  "metronome-settings": menu(["Record", "Metronome Settings…"]),
  "use-musical-grid": menu(["Record", "Use Musical Grid"]),
  "quick-punch-in": menu(["Record", "Allow Quick Punch-In"]),
  "auto-input-monitoring": menu(["Record", "Auto Input Monitoring"]),
  "low-latency-mode": menu(["Record", "Low Latency Monitoring Mode"]),

  // ---- File / project ----
  "new-project": menu(["File", "New"]),
  "new-from-template": menu(["File", "New from Template…"]),
  "close-project": menu(["File", "Close Project"]),
  "save-as": menu(["File", "Save As…"]),
  "save-copy-as": menu(["File", "Save A Copy As…"]),
  "save-as-template": menu(["File", "Save as Template…"]),
  "project-cleanup": menu(["File", "Project Management", "Clean Up…"]),
  "project-consolidate": menu(["File", "Project Management", "Consolidate…"]),
  "project-rename": menu(["File", "Project Management", "Rename…"]),
  "settings-general": menu(["File", "Project Settings", "General…"]),
  "settings-audio": menu(["File", "Project Settings", "Audio…"]),
  "settings-recording": menu(["File", "Project Settings", "Recording…"]),
  "settings-smart-tempo": menu(["File", "Project Settings", "Smart Tempo…"]),
  "settings-midi": menu(["File", "Project Settings", "MIDI…"]),

  // ---- View panels ----
  "show-library": menu(["View", "Library"]),
  "show-inspector": menu(["View", "Inspector"]),
  "show-mixer": menu(["View", "Mixer"]),
  "show-smart-controls": menu(["View", "Smart Controls"]),
  "show-editor": menu(["View", "Editor"]),
  "show-list-editors": menu(["View", "List Editors"]),
  "show-note-pads": menu(["View", "Note Pads"]),
  "show-loop-browser": menu(["View", "Loop Browser"]),
  "show-browsers": menu(["View", "Browsers"]),
  "show-control-bar": menu(["View", "Control Bar"]),
  "show-toolbar": menu(["View", "Toolbar"]),
  "show-movie-window": menu(["View", "Movie Window"]),
  "fullscreen": menu(["View", "Enter Full Screen"]),
};

export const WRAPPERS_HELP = [
  ["Track", ["new-audio-track", "new-instrument-track", "new-drummer-track", "new-midi-track", "new-tracks", "rename-track", "delete-track", "delete-unused-tracks", "create-track-stack", "flatten-stack", "global-arrangement-track", "global-marker-track", "global-tempo-track", "global-signature-track", "global-transposition-track"]],
  ["Edit", ["cut", "copy", "paste", "delete", "select-all", "undo", "redo", "undo-history"]],
  ["Automation", ["show-automation", "automation-settings", "auto-1pt-region-borders", "auto-2pt-region-borders", "auto-volume-fadeout", "auto-track-to-region", "auto-region-to-track", "auto-delete-visible", "auto-delete-all-selected", "auto-delete-redundant", "auto-quick-access"]],
  ["Navigate", ["go-position", "go-left-locator", "go-right-locator", "go-selection-start", "go-selection-end", "go-next-marker", "go-prev-marker", "scroll-to-selection", "set-locators-cycle", "set-rounded-locators-cycle", "locators-forward", "locators-backward", "create-marker", "rename-marker", "delete-marker", "open-marker-list"]],
  ["Record", ["count-in-none", "count-in-1bar", "count-in-2bar", "metronome-settings", "use-musical-grid", "quick-punch-in", "auto-input-monitoring", "low-latency-mode"]],
  ["File", ["new-project", "new-from-template", "close-project", "save-as", "save-copy-as", "save-as-template", "project-cleanup", "project-consolidate", "project-rename", "settings-general", "settings-audio", "settings-recording", "settings-smart-tempo", "settings-midi"]],
  ["View", ["show-library", "show-inspector", "show-mixer", "show-smart-controls", "show-editor", "show-list-editors", "show-note-pads", "show-loop-browser", "show-browsers", "show-control-bar", "show-toolbar", "show-movie-window", "fullscreen"]],
];
