// A Standard MIDI File a person already has (IMP-LOGI-02: exported from Logic Pro,
// GarageBand, Ableton or any DAW) read back into the schedule `scheduleToEvents` writes
// ({tick, kind, ch, pitch, vel} notes and {tick, kind: 2, ch, cc, value} controllers), per
// track with its name, so a riff or a drum part is placed in a new beat as written. The
// file's own resolution and tempo are kept: a tick is the file's tick, at its
// ticks-per-quarter-note. Running status, meta events and system-exclusive events are read
// as the SMF 1.0 specification defines them; a note-on of velocity 0 is the note-off it
// means there.

function readVlq(bytes, at) {
  let value = 0;
  let offset = at;
  for (;;) {
    const byte = bytes[offset];
    offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: offset };
  }
}

function readTrack(bytes, start, end) {
  const schedule = [];
  let name = null;
  let tempoBpm = null;
  let tick = 0;
  let at = start;
  let status = 0;
  while (at < end) {
    const delta = readVlq(bytes, at);
    tick += delta.value;
    at = delta.next;
    let byte = bytes[at];
    if (byte & 0x80) { status = byte; at += 1; } else byte = status;
    if (status === 0xff) {
      const type = bytes[at];
      const length = readVlq(bytes, at + 1);
      const data = bytes.subarray(length.next, length.next + length.value);
      if (type === 0x03) name = Buffer.from(data).toString('utf8');
      if (type === 0x51 && data.length === 3) tempoBpm = 60_000_000 / ((data[0] << 16) | (data[1] << 8) | data[2]);
      at = length.next + length.value;
      if (type === 0x2f) break;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const length = readVlq(bytes, at);
      at = length.next + length.value;
      continue;
    }
    const kind = status & 0xf0;
    const ch = status & 0x0f;
    const first = bytes[at];
    if (kind === 0xc0 || kind === 0xd0) { at += 1; continue; }
    const second = bytes[at + 1];
    at += 2;
    if (kind === 0x90 && second > 0) schedule.push({ tick, kind: 1, ch, pitch: first, vel: second });
    else if (kind === 0x80 || kind === 0x90) schedule.push({ tick, kind: 0, ch, pitch: first });
    else if (kind === 0xb0) schedule.push({ tick, kind: 2, ch, cc: first, value: second });
  }
  return { name, tempoBpm, schedule };
}

export function readSMF(buffer) {
  const bytes = new Uint8Array(buffer);
  const text = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(0) !== 'MThd') throw new Error('not a Standard MIDI File: it does not open with MThd');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const count = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error('the file counts time in SMPTE frames, not ticks per quarter note; export it with musical time');
  const tracks = [];
  let at = 8 + headerLength;
  for (let index = 0; index < count && at + 8 <= bytes.length; index += 1) {
    if (text(at) !== 'MTrk') throw new Error(`track ${index + 1} does not open with MTrk`);
    const length = view.getUint32(at + 4);
    tracks.push(readTrack(bytes, at + 8, at + 8 + length));
    at += 8 + length;
  }
  const tempoBpm = tracks.find((track) => track.tempoBpm !== null)?.tempoBpm ?? null;
  return { format, ticksPerQuarter: division, tempoBpm, tracks };
}
