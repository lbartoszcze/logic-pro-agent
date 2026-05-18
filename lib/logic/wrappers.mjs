// Named wrappers turning the 432-command Logic Pro menu catalog
// (references/logic-menus.txt) into ergonomic CLI verbs. Analog of
// final-cut-pro-agent lib/fcp-wrappers.mjs.
//
// Every wrapper dispatches through clickMenu (osascript AX action on the
// Logic Pro X process, no cursor / no screen-grab / no focus steal).

import { clickMenu, isRunning } from "./menu.mjs";

function need() {
  if (!isRunning()) throw new Error("Logic Pro is not running. Launch it first.");
}

function menu(path, label = path.join(" → ")) {
  return () => { need(); clickMenu(path); console.log(label); };
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
  open: menu(["File", "Open…"], "open dialog"),
  "close-project": menu(["File", "Close Project"]),
  save: menu(["File", "Save"], "save"),
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
  ["File", ["new-project", "new-from-template", "open", "close-project", "save", "save-as", "save-copy-as", "save-as-template", "project-cleanup", "project-consolidate", "project-rename", "settings-general", "settings-audio", "settings-recording", "settings-smart-tempo", "settings-midi"]],
  ["View", ["show-library", "show-inspector", "show-mixer", "show-smart-controls", "show-editor", "show-list-editors", "show-note-pads", "show-loop-browser", "show-browsers", "show-control-bar", "show-toolbar", "show-movie-window", "fullscreen"]],
];
