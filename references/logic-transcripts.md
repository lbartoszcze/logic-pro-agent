# Logic Pro tutorial transcript corpus

Files live in `references/youtube-transcripts/`. Captured via
`yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt`.
Analog of the final-cut-pro-agent transcript corpus.

Each video is persisted in two formats:
- `<id>-<title>.en.vtt` — full WEBVTT (timestamps + inline cue styling)
- `<id>-<title>.txt` — deduplicated plain text (timing / HTML stripped)

## Contents — 10 transcripts

### Beginner workflow
```
aKDzLV1bN4g   Logic Pro Complete Beginner Basics Tutorial (2026)
b0gViHAhWB0   Logic Pro 2026: The ONLY Guide You Need to Get Started!
HMP46jHTrI0   Logic Pro Tutorial | Ultimate Beginners Course
T9i_N7IG_nk   10 Life Changing Logic Pro X Tips
```

### Beatmaking
```
4eZFbqBCkcs   MAKE SHOCKING BEATS | Logic Pro Beginners Tutorial
```

### Mixing
```
A2HBIDCmIMk   HOW TO MIX YOUR BEATS *My Mixing Secrets* | Logic Pro X
I5zWgfpo8mA   How to MIX like a PRO in Logic Pro (Advanced Mixing 2025)
```

### Mixing + mastering
```
8Up6C2j1ggo   How to Mix and Master in Logic Pro | Stock Plugins ONLY!
nFFfRwsTA7M   How to Mix and Master Your Beats Like Industry Pros 2025
3E_z9gqP-NA   How to Master Your Beats in Logic Pro X For Beginners
```

## Reproducing

```bash
yt-dlp --skip-download --write-auto-sub --write-sub --sub-lang en \
       --sub-format vtt --output "%(id)s-%(title).70B.%(ext)s" \
       "https://www.youtube.com/watch?v=<ID>"
```

Then the in-repo VTT→TXT converter (drops the WEBVTT header, timing
arrows, numeric cue indices and inline `<...>` tags, dedupes consecutive
identical cues, writes the adjacent `.txt`) regenerates the plain-text
companions.

These ground future tuning of `lib/logic/styles.mjs` beat-style packs
(mixing chains, mastering loudness targets, per-genre archetypes) the
same way the FCP transcript corpus grounded the FCP style packs.
