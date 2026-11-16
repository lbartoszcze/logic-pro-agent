// A Standard MIDI File a person already has (IMP-LOGI-02: exported from Logic Pro,
// GarageBand, Ableton or any DAW) read back into the schedule `scheduleToEvents` writes
// ({tick, kind, ch, pitch, vel} notes and {tick, kind: 2, ch, cc, value} controllers), per
// track with its name, so a riff or a drum part is placed in a new beat as written. The
// file's own resolution and tempo are kept: a tick is the file's tick, at its
// ticks-per-quarter-note. Running status, meta events and system-exclusive events are read
// as the SMF 1.0 specification defines them; a note-on of velocity 0 is the note-off it
// means there.

// A variable-length quantity takes at most four bytes (SMF 1.0, Conventions).
const VLQ_MAX_BYTES = 4;

/** The variable-length quantity at `at`, or the error naming where it breaks off. */
function readVlq(bytes, at, end, where) {
  let value = 0;
  let offset = at;
  while (offset < end && offset < at + VLQ_MAX_BYTES) {
    const byte = bytes[offset];
    offset += 1;
    value = (value << 7) | (byte & 0x7f); // 7 bits per byte, most significant first: https://midimusic.github.io/tech/midispec.html#BM1_1
    if ((byte & 0x80) === 0) return { value, next: offset }; // bit 7 clear on the last byte: https://midimusic.github.io/tech/midispec.html#BM1_1
  }
  const why = offset >= end ? `runs past the track's end at byte ${end}` : `runs past the ${VLQ_MAX_BYTES} bytes it may take`;
  throw new Error(`${where}: the variable-length number at byte ${at} ${why}`);
}

/**
 * Track `index` between `start` and `end`. Every byte an event announces must
 * lie inside the track; running status follows only a channel message, since
 * meta and system-exclusive events cancel it (SMF 1.0, MTrk events).
 */
function readTrack(bytes, start, end, index) {
  const where = `track ${index + 1}`;
  const schedule = [];
  let name = null;
  let tempoBpm = null;
  let tick = 0;
  let at = start;
  let status = 0;
  const within = (count, what) => {
    if (at + count > end) throw new Error(`${where}: ${what} at byte ${at} runs past the track's end at byte ${end}`);
  };
  while (at < end) {
    const delta = readVlq(bytes, at, end, where);
    tick += delta.value;
    at = delta.next;
    within(1, "an event");
    if (bytes[at] & 0x80) { // a status byte has bit 7 set; otherwise running status: https://midimusic.github.io/tech/midispec.html#BM2_3
      status = bytes[at];
      at += 1;
    } else if (status === 0) {
      throw new Error(`${where}: data byte 0x${bytes[at].toString(16)} at byte ${at} has no status before it (running status follows only a channel message)`);
    }
    // FF opens a meta event (SMF 1.0 §3.1): https://midimusic.github.io/tech/midispec.html#BM3_1
    if (status === 0xff) {
      within(1, "a meta event's type");
      const type = bytes[at];
      const length = readVlq(bytes, at + 1, end, where);
      at = length.next;
      within(length.value, `meta event 0x${type.toString(16)}'s ${length.value} bytes`);
      const data = bytes.subarray(at, at + length.value);
      // FF 03 is the track name: https://midimusic.github.io/tech/midispec.html#BM3_1
      if (type === 0x03) name = Buffer.from(data).toString('utf8');
      // FF 51 03 tttttt is the tempo, 24 bits of µs per quarter note, most significant byte first; a minute is 60 s of 10^6 µs (https://physics.nist.gov/cuu/Units/outside.html, https://physics.nist.gov/cuu/Units/prefixes.html): https://midimusic.github.io/tech/midispec.html#BM3_1
      if (type === 0x51 && data.length === 3) tempoBpm = 60_000_000 / ((data[0] << 16) | (data[1] << 8) | data[2]);
      at += length.value;
      status = 0;
      // FF 2F 00 ends the track: https://midimusic.github.io/tech/midispec.html#BM3_1
      if (type === 0x2f) break;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) { // sysex events open with F0 or F7: https://midimusic.github.io/tech/midispec.html#BM2_3
      const length = readVlq(bytes, at, end, where);
      at = length.next;
      within(length.value, `a system-exclusive event's ${length.value} bytes`);
      at += length.value;
      status = 0;
      continue;
    }
    if (status >= 0xf0) { // F0 and above are system messages, not channel messages: https://midimusic.github.io/tech/midispec.html#BMA1_1
      throw new Error(`${where}: status byte 0x${status.toString(16)} before byte ${at} has no meaning in a Standard MIDI File (only meta 0xff and system exclusive 0xf0/0xf7 do)`);
    }
    const kind = status & 0xf0; // the high nibble names the message: https://midimusic.github.io/tech/midispec.html#BMA1_1
    const ch = status & 0x0f; // the low nibble nnnn is the channel: https://midimusic.github.io/tech/midispec.html#BMA1_1
    // Program change and channel pressure carry one data byte, the other channel messages two.
    const size = kind === 0xc0 || kind === 0xd0 ? 1 : 2; // https://midimusic.github.io/tech/midispec.html#BMA1_1
    within(size, `a channel message's ${size} data byte(s)`);
    const first = bytes[at];
    const second = bytes[at + 1];
    at += size;
    if (kind === 0x90 && second > 0) schedule.push({ tick, kind: 1, ch, pitch: first, vel: second });
    else if (kind === 0x80 || kind === 0x90) schedule.push({ tick, kind: 0, ch, pitch: first });
    else if (kind === 0xb0) schedule.push({ tick, kind: 2, ch, cc: first, value: second });
  }
  return { name, tempoBpm, schedule };
}

// A header chunk is "MThd", its 32-bit length, then format, track count and
// division as 16-bit words: 14 bytes (Standard MIDI File 1.0, Header Chunks).
const HEADER_BYTES = 14;
// Each chunk opens with its four-letter type and a 32-bit length.
const CHUNK_PREFIX = 8;

export function readSMF(buffer) {
  const bytes = new Uint8Array(buffer);
  const text = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(0) !== 'MThd') throw new Error(`not a Standard MIDI File: it does not open with MThd but with ${JSON.stringify(text(0))}`);
  if (bytes.length < HEADER_BYTES) throw new Error(`the file is ${bytes.length} bytes, shorter than the ${HEADER_BYTES}-byte MThd header`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const count = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error('the file counts time in SMPTE frames, not ticks per quarter note; export it with musical time'); // division bit 15 set means SMPTE time: https://midimusic.github.io/tech/midispec.html#BM2_1
  const tracks = [];
  let at = CHUNK_PREFIX + headerLength;
  for (let index = 0; index < count; index += 1) {
    if (at + CHUNK_PREFIX > bytes.length) {
      throw new Error(`the header announces ${count} tracks, but the file ends after ${index}, at byte ${bytes.length}: it is cut short`);
    }
    if (text(at) !== 'MTrk') throw new Error(`track ${index + 1} does not open with MTrk but with ${JSON.stringify(text(at))}, at byte ${at}`);
    const length = view.getUint32(at + 4);
    if (at + CHUNK_PREFIX + length > bytes.length) {
      throw new Error(`track ${index + 1} announces ${length} bytes from byte ${at + CHUNK_PREFIX}, but the file ends at byte ${bytes.length}: it is cut short`);
    }
    tracks.push(readTrack(bytes, at + CHUNK_PREFIX, at + CHUNK_PREFIX + length, index));
    at += CHUNK_PREFIX + length;
  }
  // A file that sets no tempo reads as null, not as an assumed default.
  const withTempo = tracks.find((track) => track.tempoBpm !== null);
  const tempoBpm = withTempo === undefined ? null : withTempo.tempoBpm;
  return { format, ticksPerQuarter: division, tempoBpm, tracks };
}
