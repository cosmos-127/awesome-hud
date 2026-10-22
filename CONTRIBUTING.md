# Contributing

Bug reports, theme ideas, and fixes are welcome. For a security problem, read [SECURITY.md](SECURITY.md) first.

## Set up

```sh
git clone https://github.com/cosmos-127/awesome-hud
cd awesome-hud
claude --plugin-dir .       # loads the mod, and reloads it each time you save
```

There is nothing to install: the mod has no dependencies. The scripts in `scripts/` need Python 3, and `preview.py` and `site.py` need [Bun](https://bun.sh); `preview.py` also needs Pillow and the DejaVu fonts.

## Where things are

| Path | What it holds |
| --- | --- |
| `hooks/register.tsx` | The mod: the hooks on Claude Code's events, the band it draws, git and `gh`, and `/awesome-hud`. |
| `hooks/format.ts` | Pure functions the band is made of: parsing git, test output and `gh`, gauges, rows, and `clean`. |
| `hooks/sprite.ts` | The sprite grid (18 × 10), helpers for drawing moods, and the encoder to terminal cells. |
| `hooks/symbols.ts` | The band's marks, their ASCII stand-ins, and how a terminal is judged able to draw Unicode. |
| `hooks/sound.ts` | Choosing a player and playing a theme's WAV file. |
| `hooks/theme.ts` | The `Theme` type: every field a theme must fill. |
| `hooks/themes/` | One file per theme, and `index.ts`, which lists them. |
| `hooks/awesome-hud.test.tsx` | Every test, run by `claude plugin test .`. |
| `hooks/hooks.json` | Tells Claude Code which module to load. |
| `types/index.d.ts` | The types the mod's state shares. |
| `sounds/<theme>/` | Four WAV files per theme, made by `scripts/sounds.py`. |
| `.claude-plugin/` | `plugin.json` (the version and the `/config` settings), `marketplace.json`, and the icon. |
| `index.html` | The website. `scripts/site.py` writes the themes into it; the rest is written by hand. |
| `assets/` | `preview.gif`, `moods.gif`, and `card.png`, made by `scripts/preview.py`. |

## Before you open a pull request

```sh
claude plugin test .              # the tests in hooks/awesome-hud.test.tsx
claude plugin validate --strict . # what Claude Code will load, and anything it would refuse
python3 scripts/site.py           # if you changed a theme: the website's copy of it
```

- Add a test for what you change, in `hooks/awesome-hud.test.tsx`. A fix for a bug gets a test that fails without it.
- Write like the code around yours: its names, its comments, and how much of each.
- Keep the mod free of dependencies, and keep what it runs, reads, and writes in step with the README's [Security and privacy](README.md#security-and-privacy) table. A new process, a file it reads, or anything that uses the network needs a line there, and a setting that is off by default.
- Text that a repository, a command, or a test run can shape (names, paths, output) goes through `clean` before it is drawn. A pattern that reads such text must run in linear time: no `\s*` or `.*` after `^` in a multi-line pattern, and no quantifiers that can split the same text two ways. The test "text built to make a parser backtrack cannot stall it" shows what to try.
- A new theme follows "Make a theme" in the README.
- A new or changed setting goes in `.claude-plugin/plugin.json`, the README's Settings table, and the website's.

## What CI checks

- **test** runs `claude plugin test .` and `claude plugin validate --strict .` on the Claude Code release named in `TESTED_ON` in `.github/workflows/test.yml`, and checks that the README and `index.html` both say "tested on" that release. A second job runs the same on the newest release, weekly too; it may fail without failing the build, and says when a new Claude Code breaks the mod.
- **site** runs `scripts/site.py` and fails if `index.html` changes, so the website cannot fall behind the themes.

To move to a newer Claude Code, change `TESTED_ON`, the "tested on" line in the README's Troubleshooting and in `index.html`, and the placeholder in `.github/ISSUE_TEMPLATE/bug_report.yml`.

## Releasing

1. Set the version in `.claude-plugin/plugin.json` and the placeholder in `.github/ISSUE_TEMPLATE/bug_report.yml`.
2. Move the README's **Unreleased** changelog entry under the new version.
3. If a theme's art or headline quip changed, run `python3 scripts/preview.py` and commit `assets/`.
4. Tag the commit `v<version>`, push the tag, and publish a GitHub release from it.
