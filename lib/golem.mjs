// golem (github.com/wisent-ai/golem) drives Logic Pro through Accessibility
// with Logic in the background: it finds an element by selector and acts on
// it in one call, and --expect confirms the outcome. Every Logic action in
// this checkout goes through here.
//
// golem waits with no deadline: a wait ends when the outcome shows, when
// Logic quits, or when the person interrupts. While it waits it says on
// standard error what it waits for and what it sees; those lines pass
// straight through to this process's standard error, as they come. A failed
// Logic step (`step`) reads in Logic's terms, golem's report kept under it.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// The golem binary: $GOLEM_BIN, else the release build of a golem checkout
// beside this one, else `golem` on PATH.
const SIBLING = join(HERE, "..", "..", "golem", "target", "release", "golem");
export const GOLEM = process.env.GOLEM_BIN || (existsSync(SIBLING) ? SIBLING : "golem");

// Logic Pro's bundle id: unambiguous where its name could match other apps.
export const LOGIC = "com.apple.logic10";

// golem's exit statuses (golem README, "Exit status").
export const NOT_FOUND = 3;

/** A golem command that failed, with golem's own report: what failed, what it saw, the fix and the cause. */
export class GolemFailure extends Error {
  constructor(command, report, status) {
    super(`golem ${command}: ${report.message}`);
    this.command = command;
    this.report = report;
    this.status = status;
  }
}

const MISSING_GOLEM =
  `golem is not at ${GOLEM}: run \`cargo build --release\` in a golem checkout beside this one, or set GOLEM_BIN to the binary`;

/**
 * Runs `golem <command> --app Logic <args> --json` and resolves to its
 * standard output. golem's progress lines go to this process's standard
 * error as they come; its error (one JSON object, the last thing it writes
 * to standard error) rejects as a GolemFailure with its exit status.
 */
export function golem(command, args = [], { app = true } = {}) {
  // --app goes before the caller's words, so a `--` among them cannot turn it into a positional.
  const argv = [command, ...(app ? ["--app", LOGIC] : []), "--json", ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(GOLEM, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let pending = "";
    let report = null;
    const relay = (line) => {
      if (line.startsWith('{"error"')) {
        report = JSON.parse(line).error;
      } else if (line) {
        process.stderr.write(`${line}\n`);
      }
    };
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      const lines = (pending + chunk).split("\n");
      pending = lines.pop();
      lines.forEach(relay);
    });
    child.on("error", (error) => reject(error.code === "ENOENT" ? new Error(MISSING_GOLEM) : error));
    child.on("close", (status, signal) => {
      relay(pending);
      if (status === 0) return resolve(stdout.trim());
      if (report) return reject(new GolemFailure(command, report, status));
      const how = signal ? `was stopped by ${signal}` : `exited ${status} without a report`;
      reject(Object.assign(new Error(`golem ${command} ${how}`), { status: status === null ? 1 : status }));
    });
  });
}

/** Like golem(), but resolves false where golem answers "not there" (exit 3) instead of failing. */
export async function golemHolds(command, args = []) {
  try {
    await golem(command, args);
    return true;
  } catch (error) {
    if (error instanceof GolemFailure && error.status === NOT_FOUND) return false;
    throw error;
  }
}

/** Runs golem with this process's own terminal, for `node logic.mjs golem …`; resolves to golem's exit status. */
export function golemInTerminal(command, args, { app = true } = {}) {
  const argv = [command, ...(app ? ["--app", LOGIC] : []), ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(GOLEM, argv, { stdio: "inherit" });
    child.on("error", (error) => reject(error.code === "ENOENT" ? new Error(MISSING_GOLEM) : error));
    child.on("close", (status) => resolve(status));
  });
}

/** `text` as a quoted selector value: golem's selector strings escape `"` and `\` with `\`. */
export function q(text) {
  return `"${String(text).replace(/[\\"]/g, "\\$&")}"`;
}

/** `text` matched literally inside a `~=` regular expression. */
export function literal(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** What to do in Logic's terms, by golem's cause, after golem's own fix. */
const ADVICE = {
  "selector.no-match": "Logic 13 may name this element differently from control.mjs: `node logic.mjs selectors-check` checks every selector the commands rely on, and `node logic.mjs golem tree` shows what Logic shows",
  "selector.many": "control.mjs's selector matches several of Logic's elements: `node logic.mjs golem find '<selector>'` lists them",
  "menu.no-item": "this Logic may have renamed or moved the item: `node logic.mjs wrappers-check` checks every wrapper's menu path at once, and `node logic.mjs golem menus` lists Logic's items",
  "menu.disabled": "Logic disables the item in its current state: select a track or region first, or open a project",
  "element.disabled": "Logic disables this control in its current state (a panel's button before its name is filled, a transport control with no project): `node logic.mjs status` shows what Logic shows now",
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
