"""Zero-dependency MIDI writer: emits a trap drum loop + Fm chord progression.

Run: python3 make_beat.py
Outputs drums.mid and chords.mid in the same directory.
Drag both into GarageBand / Logic / Ableton to start producing.
"""

from pathlib import Path
import struct

TICKS_PER_BEAT = 480
BPM = 140


def vlq(n: int) -> bytes:
    if n == 0:
        return b"\x00"
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def tempo_meta(bpm: int) -> bytes:
    us_per_beat = int(60_000_000 / bpm)
    return b"\x00\xFF\x51\x03" + struct.pack(">I", us_per_beat)[1:]


def time_sig() -> bytes:
    return bytes([0x00, 0xFF, 0x58, 0x04, 4, 2, 24, 8])


def end_of_track() -> bytes:
    return b"\x00\xFF\x2F\x00"


def note_on(delta, channel, pitch, vel):
    return vlq(delta) + bytes([0x90 | channel, pitch, vel])


def note_off(delta, channel, pitch):
    return vlq(delta) + bytes([0x80 | channel, pitch, 0])


def program_change(delta, channel, program):
    return vlq(delta) + bytes([0xC0 | channel, program])


def build_track(events: bytes) -> bytes:
    return b"MTrk" + struct.pack(">I", len(events)) + events


def build_smf(tracks):
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), TICKS_PER_BEAT)
    return header + b"".join(tracks)


def schedule_to_events(schedule):
    schedule.sort(key=lambda e: (e[0], e[1]))
    out = bytearray()
    prev = 0
    for tick, kind, ch, pitch, vel in schedule:
        delta = tick - prev
        if kind == 1:
            out += note_on(delta, ch, pitch, vel)
        else:
            out += note_off(delta, ch, pitch)
        prev = tick
    return bytes(out)


def make_drums(out_path: Path, bars: int = 4) -> None:
    sixteenth = TICKS_PER_BEAT // 4
    KICK, SNARE, CHAT, OHAT = 36, 38, 42, 46
    ch = 9

    kick_pat  = "x..x..x...x..x.."
    snare_pat = "....x.......x..."
    chat_pat  = "x.x.x.x.x.x.x.x."
    ohat_pat  = "..........x....."

    schedule = []
    for bar in range(bars):
        bar_offset = bar * 16 * sixteenth
        for pat, pitch, base_vel in (
            (kick_pat, KICK, 110),
            (snare_pat, SNARE, 105),
            (chat_pat, CHAT, 75),
            (ohat_pat, OHAT, 80),
        ):
            for i, c in enumerate(pat):
                if c == "x":
                    t = bar_offset + i * sixteenth
                    vel = base_vel + (10 if (pitch == CHAT and i % 4 == 0) else 0)
                    schedule.append((t, 1, ch, pitch, vel))
                    schedule.append((t + sixteenth - 10, 0, ch, pitch, 0))

    meta_track = build_track(tempo_meta(BPM) + time_sig() + end_of_track())
    drum_track = build_track(schedule_to_events(schedule) + end_of_track())
    out_path.write_bytes(build_smf([meta_track, drum_track]))


def make_chords(out_path: Path) -> None:
    # F minor: i - VI - III - VII  =>  Fm7 - Dbmaj7 - Abmaj7 - Ebmaj7
    chords = [
        [53, 56, 60, 63],  # Fm7
        [49, 53, 56, 60],  # Dbmaj7
        [56, 60, 63, 67],  # Abmaj7
        [51, 55, 58, 62],  # Ebmaj7
    ]
    ch = 0
    bar_ticks = TICKS_PER_BEAT * 4
    schedule = []
    for i, notes in enumerate(chords):
        start = i * bar_ticks
        end = start + bar_ticks - 20
        for n in notes:
            schedule.append((start, 1, ch, n, 80))
            schedule.append((end, 0, ch, n, 0))

    meta_track = build_track(tempo_meta(BPM) + time_sig() + end_of_track())
    chord_events = program_change(0, ch, 4) + schedule_to_events(schedule) + end_of_track()
    chord_track = build_track(chord_events)
    out_path.write_bytes(build_smf([meta_track, chord_track]))


def make_bass(out_path: Path) -> None:
    # Sub-bass on chord roots one octave down, syncing to kick pattern hits.
    # Roots: F (29), Db (25), Ab (32), Eb (27) — MIDI note numbers in C1 range.
    roots = [29, 25, 32, 27]
    ch = 1
    sixteenth = TICKS_PER_BEAT // 4
    kick_pat = "x..x..x...x..x.."
    schedule = []
    for bar, root in enumerate(roots):
        bar_offset = bar * 16 * sixteenth
        for i, c in enumerate(kick_pat):
            if c == "x":
                t = bar_offset + i * sixteenth
                # Last kick of the bar slides up an octave for movement.
                pitch = root + 12 if i == 12 else root
                schedule.append((t, 1, ch, pitch, 100))
                schedule.append((t + sixteenth * 2 - 10, 0, ch, pitch, 0))

    meta_track = build_track(tempo_meta(BPM) + time_sig() + end_of_track())
    # GM program 38 = Synth Bass 1. Logic will replace with Alchemy/ES2 anyway.
    bass_events = program_change(0, ch, 38) + schedule_to_events(schedule) + end_of_track()
    bass_track = build_track(bass_events)
    out_path.write_bytes(build_smf([meta_track, bass_track]))


def make_melody(out_path: Path) -> None:
    # Simple F minor lead, one motif per bar, sitting on chord tones.
    # (pitch, start_sixteenth, length_sixteenths)
    # Bar 1 Fm7   : C5 Eb5 F5 Eb5
    # Bar 2 Dbmaj7: F5 Ab5 G5
    # Bar 3 Abmaj7: Eb5 G5 Ab5 G5
    # Bar 4 Ebmaj7: Bb4 C5 Eb5 (rest)
    notes = [
        (0, [(72, 0, 2), (75, 2, 2), (77, 4, 2), (75, 6, 2), (72, 8, 4)]),
        (1, [(77, 0, 3), (80, 3, 3), (79, 6, 4)]),
        (2, [(75, 0, 2), (79, 2, 2), (80, 4, 3), (79, 7, 3), (75, 10, 4)]),
        (3, [(70, 0, 2), (72, 2, 2), (75, 4, 6)]),
    ]
    ch = 2
    sixteenth = TICKS_PER_BEAT // 4
    schedule = []
    for bar, hits in notes:
        bar_offset = bar * 16 * sixteenth
        for pitch, start_16, length_16 in hits:
            t = bar_offset + start_16 * sixteenth
            end = t + length_16 * sixteenth - 10
            schedule.append((t, 1, ch, pitch, 90))
            schedule.append((end, 0, ch, pitch, 0))

    meta_track = build_track(tempo_meta(BPM) + time_sig() + end_of_track())
    # GM program 5 = Electric Piano 2 (Rhodes-ish). Swap for Alchemy in Logic.
    mel_events = program_change(0, ch, 5) + schedule_to_events(schedule) + end_of_track()
    mel_track = build_track(mel_events)
    out_path.write_bytes(build_smf([meta_track, mel_track]))


def main() -> None:
    here = Path(__file__).parent
    make_drums(here / "drums.mid", bars=4)
    make_chords(here / "chords.mid")
    make_bass(here / "bass.mid")
    make_melody(here / "melody.mid")
    for name in ("drums.mid", "chords.mid", "bass.mid", "melody.mid"):
        print(f"Wrote {here/name}")


if __name__ == "__main__":
    main()
