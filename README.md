# awesome-hud

A pop-culture HUD for Claude Code. An animated pixel mascot lives under your prompt and reacts to what Claude is doing, with a sound for the moments that matter and a compact status bar beside it: model, context, plan limits, and the state of your repository.

![awesome-hud under the prompt](assets/preview.gif)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install awesome-hud --marketplace cosmos-127/awesome-hud
```

Or from a shell: `claude plugin install awesome-hud --marketplace cosmos-127/awesome-hud`. The mascot shows up under the prompt right away.

The band draws in terminal sessions; the desktop app shows no band. Built and tested on Claude Code 2.1.304. The mods API it uses is early access and may change between releases.

## Themes

| Theme | Mascot | Sounds |
| --- | --- | --- |
| `cat` (default) | an orange tabby with opinions, and a tail that says what it thinks | a mrrp, a hiss, a questioning meow, an 8-bit arpeggio |
| `chibi` | big violet eyes, a side ponytail, anime feelings | a sparkle, a boing, a ding-dong, a magical fanfare |
| `got` | a direwolf of the North, in the snow | a war horn, a sword clang, two raven caws, a horn fanfare |

Each theme has its own lines for every mood and its own spinner words, and its mascot shows itself at twice the size when you switch to it. `got` is an unofficial fan homage to *Game of Thrones*, not affiliated with or endorsed by HBO. Every picture and sound here is original: the mascots are drawn pixel by pixel and the sounds are synthesized by `scripts/sounds.py`.

## What the band shows

Beside the mascot, top to bottom:

1. The model and effort, the folder, session time and cost.
2. Context used, and about how many turns are left before auto-compact.
3. The 5-hour plan window with its reset time, and the week beside it. Bars turn yellow and then red as they fill.
4. The repository and what changed in it (below).
5. What the mascot has to say: the file or command it is watching, or a line for its mood. At rest it says what needs you instead: failing tests, a rebase stopped on conflicts, a failed agent.

```
⎇ main ↑2 ↓1       │ ● 3  ✚ 5  ? 1 new │ ≡ 1 stash
✎ 4 files +120 −34 │ ✓ 24 passed (3m ago) │ PR #42 ✓
```

The repository takes two rows: what git holds, then what Claude did and ran. A clean tree reads `✓ clean`.

| Part | Meaning |
| --- | --- |
| `⎇ main` | The branch, and `\|REBASE 2/5`, `MERGING` and the like when git is mid-operation. |
| `↑2 ↓1` | Commits ahead of and behind the upstream. |
| `● 3  ✚ 5  ? 1 new` | Files staged, changed, untracked (`✓ clean` when none). Conflicts show in red. |
| `≡ 1 stash` | Stashes. |
| `✎ 4 files +120 −34` | Files Claude edited in the project this session, and the lines added and removed. |
| `✓ 24 passed (3m ago)` | The last test run and how long ago it ended (vitest, jest, pytest, go, cargo and many more); gray and marked `stale` once Claude has edited since. |
| `PR #42` | The branch's pull request, once Claude opens one; with **PR status** on, its checks and review too. |

A row with too much for the room drops its least telling parts first. In a terminal narrower than about 70 columns or shorter than 25 rows, the band folds to two lines with no mascot; so does **Layout** `compact`. **Position** `above` puts the band over the prompt.

## Moods and sounds

![Every theme in every mood](assets/moods.gif)

| Mood | When |
| --- | --- |
| idle / asleep | Waiting for your prompt; asleep after five quiet minutes |
| working | Claude is on a turn; its eyes follow the work |
| waiting | Claude needs your permission or an answer |
| error | A tool or test run failed, or the turn ended in an error |
| done | The turn finished |
| party | Tests all pass, a commit or push lands, or you type `pspsps` |
| sweat | Context 85% full, or a plan limit 90% used |

A sound plays on a party, on an error, when Claude needs you, and when it answers a turn that took 30 seconds or more. macOS plays them through Claude Code; Linux needs `pw-play`, `paplay` or `aplay`. Turn them off with **Sounds**.

## Commands

- `/awesome-hud` lists the themes; `/awesome-hud <theme>` switches and saves the choice.
- `/awesome-hud files` lists the files Claude edited this session with the lines changed and the state git has each in, plus the commits Claude made and the branch's pull request.
- `pspsps` at the prompt calls the mascot. The prompt still goes to Claude.

## Settings

Run `/config` and look for the awesome-hud rows.

| Setting | Default | What it does |
| --- | --- | --- |
| Theme | `cat` | `cat`, `chibi` or `got`. |
| Position | `below` | The band under the prompt, or `above` it. |
| Layout | `full` | The mascot beside five rows of stats, or `compact`: two lines, no mascot. |
| Sounds | on | Theme sounds for the moments above. |
| Session cost | `auto` | Shown when you pay per token, hidden on Pro or Max, where it is only an estimate. |
| Themed words | on | Theme words in Claude Code's spinner and turn-closing line, and a toast when tests pass or a commit or push lands. |
| PR status | off | Asks GitHub (`gh pr view`) for the pull request's checks and review. The only part that uses the network. |

## Make a theme

A theme is one file in `hooks/themes/` plus four sounds. `hooks/theme.ts` documents every field.

1. Copy `hooks/themes/cat.ts` to `hooks/themes/<name>.ts` and rename the export.
2. Draw the face in columns 0–13 of an 18 × 10 grid, one character per pixel and `.` for transparent, with a color per character in `palette`. Give it mid-tone outlines and shades: near-black vanishes on a dark terminal and near-white on a light one.
3. Columns 14–17 are the mascot's too: at rest it keeps something there (the cat's tail, the chibi's ponytail, the wolf's snow), and a mood that needs an emote puts it there. Write all eight `moods` with `paint`, `stamp`, `shift` and `layer` from `hooks/sprite.ts`, as `cat.ts` does.
4. Write its `quips`, `verbs`, `spinner`, `turn` and `party` lines.
5. Add four WAV files to `sounds/<name>/` (`done`, `error`, `waiting`, `party`); `scripts/sounds.py` shows how the built-in ones are synthesized.
6. Register it in `hooks/themes/index.ts` (any name but `files`) and in `userConfig.theme.options` in `.claude-plugin/plugin.json`.
7. Run `claude plugin test .` to check the frames and the sounds.

## Privacy

Everything runs on your machine unless you turn **PR status** on. The mod reads the figures Claude Code already shows, the output of the test commands Claude runs, the paths and line counts of files Claude edits, and your repository through read-only `git` commands and git's own files. On Linux and Windows it runs a sound player. The only thing it saves is your settings in `/config`.

## Develop

```
git clone https://github.com/cosmos-127/awesome-hud
cd awesome-hud
claude --plugin-dir .       # reloads the mod each time you save
claude plugin test .        # the tests in hooks/awesome-hud.test.tsx
claude plugin validate .    # what Claude Code will load, and anything it would refuse
python3 scripts/sounds.py   # rebuild sounds/ from the recipes in the script
python3 scripts/preview.py  # redraw assets/preview.gif and assets/moods.gif from the themes (needs bun and Pillow)
```

## License

[MIT](LICENSE)
