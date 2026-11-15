// golem (github.com/wisent-ai/golem) drives Logic Pro through Accessibility
// with Logic in the background: it finds an element by selector and acts on
// it in one call, and --expect confirms the outcome. Every Logic action in
// this checkout goes through here.

import { execFileSync } from "node:child_process";
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
export const UNMET = 5;

/**
 * Runs `golem <command> <args> --app Logic Pro` and returns its standard
 * output. A failure throws an Error carrying golem's own message and exit
 * status, so a caller can tell "not there" (NOT_FOUND) from "did not happen"
 * (UNMET).
 */
export function golem(command, args = [], { app = true } = {}) {
  // --app goes before the caller's words, so a `--` among them cannot turn it into a positional.
  const argv = [command, ...(app ? ["--app", LOGIC] : []), ...args];
  try {
    return execFileSync(GOLEM, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: Infinity }).trim();
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`golem is not at ${GOLEM}: run \`cargo build --release\` in a golem checkout beside this one, or set GOLEM_BIN`);
    }
    const said = String(error.stderr || error.message).trim().replace(/^golem: /, "");
    throw Object.assign(new Error(`golem ${command}: ${said}`), { status: error.status });
  }
}

/** Like golem(), but a NOT_FOUND or UNMET answer is false instead of an error. */
export function golemHolds(command, args = []) {
  try {
    golem(command, args);
    return true;
  } catch (error) {
    if (error.status === NOT_FOUND || error.status === UNMET) return false;
    throw error;
  }
}

/** `text` as a quoted selector value: golem's selector strings escape `"` and `\` with `\`. */
export function q(text) {
  return `"${String(text).replace(/[\\"]/g, "\\$&")}"`;
}

/** `text` matched literally inside a `~=` regular expression. */
export function literal(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
