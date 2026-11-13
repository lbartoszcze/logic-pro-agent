// What this program's `sources discover` (and the import it stands for) saw, reported with
// the person's consent so the fleet learns which sources people keep (the import plan's
// priorities): one `<PRODUCT>.sources.discovered` event each, sent to Wisent Integrations'
// onboarding domain at the route Stado's `onboarding-events` alternative names (`stado
// capabilities resolve onboarding-events --consumer <PRODUCT> --json`), with the token TOKEN
// names; Integrations refuses any field but these. An event holds the adapter, whether its
// source was found, its counts rounded into buckets and the outcome, under a random subject
// kept with the answer; never a name, a path or a value. Nothing is sent before the person
// answers once (`<COMMAND> sources share yes | no`), kept in
// `$XDG_CONFIG_HOME/<PRODUCT>/sources-share.json` (else `~/.config/<PRODUCT>/`); the listing
// shows the question with exactly what an event holds until then. Every step works the same
// either way, and each answer's `reported` says whether it was sent and why not.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const PRODUCT = 'logic-pro-agent';
const COMMAND = 'node read-midi.mjs';
const TOKEN = 'LOGIC_PRO_AGENT_STADO_INTEGRATION_TOKEN';
/** The adapter the question's example event names. */
const EXAMPLE = 'IMP-LOGI-02';

const kept = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), PRODUCT, 'sources-share.json');

/** The person's answer and the subject it was given under: undefined until they answer. */
function consent() {
  try {
    const { share, subject } = JSON.parse(readFileSync(kept(), 'utf8'));
    return typeof share === 'boolean' && typeof subject === 'string' ? { share, subject } : undefined;
  } catch {
    return undefined;
  }
}

const bucket = (count) => (count === 0 ? '0' : count < 10 ? '1-9' : count < 100 ? '10-99' : count < 1000 ? '100-999' : count < 10000 ? '1000-9999' : '10000+');

function event(subject, adapter, found, counts, outcome) {
  return {
    event_id: randomUUID(),
    product_id: PRODUCT,
    subject_hash: subject,
    adapter,
    found,
    counts: Object.fromEntries(Object.entries(counts).map(([kind, count]) => [kind, bucket(count)])),
    outcome,
    scope_kind: 'user',
    occurred_at: new Date().toISOString(),
  };
}

/** The question the listing asks until it is answered, with exactly what an event holds. */
export function question() {
  const given = consent();
  if (given) return { share: given.share, change_with: `${COMMAND} sources share yes | no` };
  return {
    asked: `May ${PRODUCT} send, for each source it reads, which source it was, whether it was there and how many records it held, rounded, so the sources people keep are read first? No name, path or value is sent; everything works the same either way.`,
    sends: event('0'.repeat(64), EXAMPLE, true, { records: 12 }, 'discovered'),
    answer_with: `${COMMAND} sources share yes | no`,
  };
}

/** `share` true or false keeps the answer; undefined answers the question. */
export function share(answer) {
  if (answer === undefined) return question();
  const path = kept();
  const subject = consent()?.subject ?? randomBytes(32).toString('hex');
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ share: answer, subject, answered_at: new Date().toISOString() }, null, 2)}\n`);
  } catch (error) {
    throw new Error(`whether import counts are shared is kept in ${path}, and it could not be written (${error.message}); set XDG_CONFIG_HOME to a directory this user can write, then answer again`);
  }
  return { share: answer, kept: path };
}

async function send(adapter, found, counts, outcome) {
  const given = consent();
  if (!given) return { sent: false, why: `not asked yet: ${COMMAND} sources share yes | no` };
  if (!given.share) return { sent: false, why: 'you chose not to share' };
  const token = (process.env[TOKEN] ?? '').trim();
  if (!token) return { sent: false, why: `${TOKEN} is unset, so there is no credential to report with` };
  const stado = process.env.STADO_BIN || 'stado';
  const resolved = spawnSync(stado, ['capabilities', 'resolve', 'onboarding-events', '--consumer', PRODUCT, '--json'], { encoding: 'utf8' });
  if (resolved.error) return { sent: false, why: `${stado} cannot be run: ${resolved.error.message}` };
  if (resolved.status !== 0) return { sent: false, why: `Stado resolved no onboarding route: ${resolved.stderr.trim()}` };
  let route;
  let provider;
  try {
    ({ route, provider } = JSON.parse(resolved.stdout));
  } catch (error) {
    return { sent: false, why: `Stado's resolution is not JSON: ${error.message}` };
  }
  if (typeof route !== 'string') return { sent: false, why: `Stado's resolution names no route: ${resolved.stdout.trim()}` };
  try {
    const answered = await fetch(`${route.replace(/\/+$/, '')}/api/integration/onboarding/${PRODUCT}.sources.discovered`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(event(given.subject, adapter, found, counts, outcome)),
      redirect: 'manual',
    });
    return answered.ok ? { sent: true, to: provider } : { sent: false, why: `${provider} answered HTTP ${answered.status}` };
  } catch (error) {
    return { sent: false, why: `${provider} did not answer: ${error.message}` };
  }
}

/** `answer` with `reported`: whether the event of `adapter` was sent, and why not. */
export async function reported(answer, adapter, found, counts, outcome = 'discovered') {
  return { ...answer, reported: await send(adapter, found, counts, outcome) };
}
