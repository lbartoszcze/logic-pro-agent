// MIDI file primitives. Used by make-beat.mjs.

export const TPB = 480;

export function vlq(n) {
  if (n === 0) return Buffer.from([0]); // a zero quantity is one 00 byte: https://midimusic.github.io/tech/midispec.html#BM1_1
  const bytes = [n & 0x7f]; // 7 bits per byte: https://midimusic.github.io/tech/midispec.html#BM1_1
  n >>= 7; // https://midimusic.github.io/tech/midispec.html#BM1_1
  while (n) {
    bytes.push((n & 0x7f) | 0x80); // bit 7 set on every byte but the last: https://midimusic.github.io/tech/midispec.html#BM1_1
    n >>= 7; // https://midimusic.github.io/tech/midispec.html#BM1_1
  }
  return Buffer.from(bytes.reverse());
}

export function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

export function u16be(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff, 0);
  return b;
}

export function tempoMeta(bpm) {
  // A minute is 60 s (https://physics.nist.gov/cuu/Units/outside.html) of 10^6 µs each (https://physics.nist.gov/cuu/Units/prefixes.html).
  const us = Math.round(60_000_000 / bpm);
  return Buffer.concat([
    // At delta 0, FF 51 03 tttttt: Set Tempo, three bytes of µs per quarter note (SMF 1.0 §3.1): https://midimusic.github.io/tech/midispec.html#BM3_1
    Buffer.from([0x00, 0xff, 0x51, 0x03]),
    // tttttt is 24 bits, most significant byte first: https://midimusic.github.io/tech/midispec.html#BM3_1
    Buffer.from([(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]),
  ]);
}

// Tempo change at a non-zero tick. Same bytes as tempoMeta but with the
// delta-time prefix encoded as a VLQ instead of a hard-coded 0x00.
export function tempoMetaAt(deltaTicks, bpm) {
  // A minute is 60 s (https://physics.nist.gov/cuu/Units/outside.html) of 10^6 µs each (https://physics.nist.gov/cuu/Units/prefixes.html).
  const us = Math.round(60_000_000 / bpm);
  return Buffer.concat([
    vlq(deltaTicks),
    // FF 51 03 tttttt: Set Tempo (SMF 1.0 §3.1): https://midimusic.github.io/tech/midispec.html#BM3_1
    Buffer.from([0xff, 0x51, 0x03]),
    // tttttt is 24 bits, most significant byte first: https://midimusic.github.io/tech/midispec.html#BM3_1
    Buffer.from([(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]),
  ]);
}

export function trackName(name) {
  const bytes = Buffer.from(name, "utf8");
  // At delta 0, FF 03 len text: Sequence/Track Name (SMF 1.0 §3.1): https://midimusic.github.io/tech/midispec.html#BM3_1
  return Buffer.concat([Buffer.from([0x00, 0xff, 0x03]), vlq(bytes.length), bytes]);
}

export const TIME_SIG = Buffer.from([0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8]);
// At delta 0, FF 2F 00: End of Track (SMF 1.0 §3.1): https://midimusic.github.io/tech/midispec.html#BM3_1
export const END_OF_TRACK = Buffer.from([0x00, 0xff, 0x2f, 0x00]);

export function noteOn(delta, ch, pitch, vel) {
  return Buffer.concat([vlq(delta), Buffer.from([0x90 | ch, pitch, vel])]); // Note On 1001nnnn: https://midimusic.github.io/tech/midispec.html#BMA1_1
}

export function noteOff(delta, ch, pitch) {
  return Buffer.concat([vlq(delta), Buffer.from([0x80 | ch, pitch, 0])]);
}

export function programChange(delta, ch, program) {
  return Buffer.concat([vlq(delta), Buffer.from([0xc0 | ch, program])]); // Program Change 1100nnnn: https://midimusic.github.io/tech/midispec.html#BMA1_1
}

// Control Change (CC). CC1 = modulation, CC11 = expression, CC7 = volume.
export function controlChange(delta, ch, controller, value) {
  return Buffer.concat([vlq(delta), Buffer.from([0xb0 | ch, controller & 0x7f, value & 0x7f])]); // Control Change 1011nnnn, 7-bit data: https://midimusic.github.io/tech/midispec.html#BMA1_1
}

export function buildTrack(eventBufs) {
  const body = Buffer.concat(eventBufs);
  return Buffer.concat([Buffer.from("MTrk"), u32be(body.length), body]);
}

export function buildSMF(tracks) {
  const header = Buffer.concat([
    Buffer.from("MThd"),
    u32be(6), // the header chunk's length is 6: https://midimusic.github.io/tech/midispec.html#BM2_1
    u16be(1),
    u16be(tracks.length),
    u16be(TPB),
  ]);
  return Buffer.concat([header, ...tracks]);
}

export function scheduleToEvents(schedule) {
  // kind: 1 = noteOn, 0 = noteOff, 2 = CC (uses {cc, value} fields)
  schedule.sort((a, b) => a.tick - b.tick || a.kind - b.kind);
  const out = [];
  let prev = 0;
  for (const e of schedule) {
    const delta = e.tick - prev;
    if (e.kind === 2) out.push(controlChange(delta, e.ch, e.cc, e.value));
    else if (e.kind === 1) out.push(noteOn(delta, e.ch, e.pitch, e.vel));
    else out.push(noteOff(delta, e.ch, e.pitch));
    prev = e.tick;
  }
  return out;
}
