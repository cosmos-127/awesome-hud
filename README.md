# awesome-hud

A pop-culture HUD for Claude Code. An animated pixel mascot lives under your prompt and reacts to what Claude is doing (reading, editing, waiting on you, failing, finishing), with a sound for the moments that matter and a compact status bar beside it: model and effort, folder, context, plan limits, and the repository: its branch and where it stands, what Claude changed, the last test run and the pull request.

![awesome-hud under the prompt](assets/preview.gif)

## Themes

| Theme | Mascot | Sounds |
| --- | --- | --- |
| `cat` (default) | an orange cat with opinions | a mrrp, a hiss, a questioning meow, an 8-bit arpeggio |
| `chibi` | big eyes, sweat drops, anime feelings | a sparkle, a boing, a ding-dong, a magical fanfare |
| `got` | a direwolf of the North; winter is always coming | a war horn, a sword clang, two raven caws, a horn fanfare |

Each theme also has its own lines for every mood, its own words for Claude Code's spinner, and a banner: ASCII art, drawn from an original picture, that prints when you switch to it.

<details>
<summary><code>/awesome-hud got</code></summary>

```
::::::::::::::::::::::::::-:::::::::::::::::::::
::+::::::::::::::::::=+#%@@@%@%#*+-:::::::::::::
:::::::::::::::::::*%@@@%%@@:-@@@#+.:::::--:::::
::---::::::::::::+@@@@@@%%@+  ..   +@#::::::::::
::::::::-:::::::*@@@@@@@@@*     :*@@@@%-::::::::
:::::::::::::::+@@@@@@@@@*     -@@@%%%@#::::::::
:::::::::::::::%@@@@@@@@+      +@%####%@-:::::::
:::::::::::::::@@@@@@@@=       =@@%##%@@=:::::::
::--:=-::::::::#@@@@@@+        .@@@@@@@@-:::::::
::::::-::::::-:-@@@@%*          @@@@@@@*::::::::
::::::::::::::::=@@@%.         :%##%@@*:::::::::
:::::::::::::::::-#@*          -@%%@%=::::::::::
:::::::::::::::::::-:          :@@#=::::::::::::
::::::::::::::::::::.        =  -:::::::::::::::
:::-::...........           ..  ........::::::::
```

</details>

`got` is an unofficial fan homage to *Game of Thrones*. It is not affiliated with or endorsed by HBO or anyone behind the show. Every picture and sound in this repository is original: the mascots are drawn pixel by pixel, the banners are converted from pictures drawn for them, and the sounds are synthesized by `scripts/sounds.py`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install awesome-hud --marketplace cosmos-127/awesome-hud
```

Answer `y` to add the marketplace, pick a scope, and set the options or keep the defaults. The mascot shows up under the prompt right away.

From a shell:

```
claude plugin install awesome-hud --marketplace cosmos-127/awesome-hud
```

The band draws in terminal sessions; the desktop app shows no band.

Built and tested on Claude Code 2.1.304. The mods API it uses is early access and may change between releases.

## What the band shows

The band sits under the prompt, after Claude Code's own hint line. **Position** in `/config` moves it above the prompt instead, where it steps aside while Claude Code shows a survey.

Top to bottom, beside the mascot:

1. The model and effort, the folder, how long the session has run, and its cost (see [Settings](#settings)). In a linked worktree the folder is the project's, the worktree's name after it (`awesome-hud ↳ brave-fox`).
2. Context used, and roughly how many turns are left before auto-compact, from how fast recent turns grew it. From 70% full, also what takes the most of it, as `/context` counts it (`· Messages 120k`).
3. The plan windows: the 5-hour window, how long until it resets and when, in your own time as `/usage` shows it (`↻ in 58m · 3:20am`), and the week beside it (`· 7d 23%`). Once the week warns, it gets a bar of its own and the time to its reset (`· 7d ━━━━━━━━━╸──  80% ↻ 2d 14h`).
4. The repository and what changed in it: see [The repository row](#the-repository-row).
5. What the mascot has to say: the file or command it is watching, or a line for its mood. While Claude is not working, it says what needs you instead of a joke: failing tests, a rebase or merge stopped halfway and its conflicts (`⎇ rebasing 2/5, 2 conflicts`), an agent that failed (until your next prompt), then the agents still at work (`◐ 2 agents: <task>`).

Without plan limits (an API key), the repository row comes right after the context.

The bars take the theme's color until they need attention: yellow from 70% for the context and 75% for a plan window, red from 85% and 90%, with the percent turning bold in the same color. `┊` on the context bar marks where auto-compact starts, as Claude Code's own context breakdown says once it has been counted: when the session starts, and at each turn's end from 70% full. With auto-compact off the mark goes, and the count reads `~4 turns to full`. The quip's `»` turns red on a failure, yellow while Claude waits on you and green when it finishes, and a tool running past a minute says how long it has run (`pawing at npm run build · 2m`).

A row with more than it has room for drops whole parts, the least telling first: the stashes, the line counts, the upstream's note, the cost, the worktree's name, the session's time, the count of files, the tree. The branch, its conflicts, the commits to push and pull and the last test run stay longest.

In a terminal narrower than about 75 columns, or under the prompt in one shorter than 24 rows, the mascot steps aside and the band folds to two lines: the model with a text face and the quip, then the context and plan-limit bars. **Layout** `compact` in `/config` keeps it at two lines everywhere, with no mascot: the first row with the repository's parts after the folder, then the bars.

### The repository row

`⎇ main ↑2 ↓1 · ●3 ✚5 ?1 ≡1 · ✎4 +120 −34 · ✓ 24 passed · 3m ago · PR #42 ✓`

| Part | What it says |
| --- | --- |
| `⎇ main` | The branch. A long name gives up its middle (`feature/JIRA…oauth-login`); a detached HEAD shows its commit (`⎇ @1a2b3c4`). |
| `\|REBASE 2/5` | What git is in the middle of, as git's own prompt names it: `REBASE` or `AM` with the step, `MERGING`, `CHERRY-PICKING`, `REVERTING`, `BISECTING`. During a rebase the branch is the one being rebased. |
| `↑2 ↓1` | Commits ahead of and behind the upstream. `↓` is yellow, and dim once the last fetch is over a day old, since it counts only what that fetch saw. A branch with no upstream counts in `↑` the commits no remote has, then says `unpublished`; one whose upstream the remote no longer has (its pull request merged, say) says `upstream gone`. |
| `2 conflicts` | Files in conflict, in red. |
| `●3 ✚5 ?1` | Files staged, files changed but not staged, and untracked files. Where `git status` takes over 3 seconds, the band keeps the branch and the last counts, dims the counts, and asks again without untracked files, so `?` goes. |
| `≡1` | Stashes. |
| `✎4 +120 −34` | The files Claude edited in the project this session, a subagent's edits too, and the lines those edits added and removed. A file outside the repository (Claude's memory, a scratch file) does not count, nor does an edit held for review. |
| `✓ 24 passed · 3m ago` | The last test run, Claude's or a subagent's. |
| `PR #42` | The branch's pull request, a link, once Claude opens or changes one with `gh pr`; `merged`, `closed` or `draft` when it is. With **PR status** on, the band asks GitHub for it, with its checks (`✓`, `✗2` failing, `◌3` still running) and its review (`approved`, `changes requested`). |

The git parts are read again when a turn ends, when you send a prompt, after a git command Claude runs, a moment after Claude's edits pause, and within a minute of git writing to its own files from anywhere else: another terminal, your editor, a `!` command.

The test counts come from the summary vitest, jest, pytest, `python -m unittest`, `go test`, cargo, bun, mocha, Playwright, RSpec, PHPUnit, Pest, `dotnet test`, Maven, `deno test`, `mix test` or `swift test` prints, run directly or through `make`, `just`, `turbo`, `nx`, `tox` or `nox`. A run piped through `tail` still counts, and one too long to show Claude whole is read from the output Claude Code saved. A result older than Claude's last edit in the project turns gray: it no longer vouches for the code. The same command run again says what it failed before (`✗ 2 failed (was 5)`).

## Moods

| Mood | When |
| --- | --- |
| idle | Waiting for your prompt; blinks now and then |
| working | Claude is on a turn; its eyes follow the work |
| waiting | Claude needs your permission or an answer |
| error | A tool or a test run failed, or the turn ended in an error |
| done | The turn finished |
| party | A test run's summary says every test passed, a commit or push landed, or you typed `pspsps` |
| sweat | Context is 85% full, or a plan limit 90% used |
| asleep | Nothing has happened for five minutes |

## Sounds

| Sound | When |
| --- | --- |
| done | Claude answers a turn that took 30 seconds or more, unless a party already played in it |
| error | A tool or a test run fails (once a turn, however many fail) or the turn ends in an error |
| waiting | Claude needs your permission or asks you a question |
| party | A test run passes, a commit or push lands, or you type `pspsps` |

Interrupting a turn plays nothing. A test run that was refused, interrupted or sent to the background starts no party. On macOS Claude Code plays the sounds itself. On Linux, where it has no player, the mod uses the first of `pw-play`, `paplay` or `aplay` it finds; on Windows it uses PowerShell, which has not been tested yet. Turn sounds off with **Sounds** in `/config`.

## Commands

- `/awesome-hud` lists the themes.
- `/awesome-hud <theme>`, say `/awesome-hud got`, switches the theme, prints its banner, and saves the choice in `/config`.
- `/awesome-hud files` lists the files Claude edited this session: each with its edits, the lines added and removed, and the state git has it in now (`changed`, `staged`, `new`, or `clean` once committed or reverted); then the files outside the project, the commits Claude made, and the branch's pull request. The table is drawn for you; Claude reads one line that sums it up.
- `pspsps` at the prompt calls the mascot. The prompt still goes to Claude.

## Settings

Run `/config` and look for the awesome-hud rows.

| Setting | Default | What it does |
| --- | --- | --- |
| Theme | `cat` | `cat`, `chibi` or `got`. |
| Position | `below` | `below` puts the band under the prompt, after Claude Code's hint line; `above` puts it over the prompt. |
| Layout | `full` | `full` draws the mascot beside five rows of stats; `compact` draws the stats alone on two lines. |
| Sounds | on | A short theme sound when Claude finishes a turn of 30 seconds or more, hits an error, needs your OK, or a party starts. |
| Session cost | `auto` | `auto` shows the cost when you pay per token and hides it on a Pro or Max plan, where it is an API-price estimate rather than a bill. `show` and `hide` decide for you. |
| Themed words | on | Theme words in Claude Code's own spinner and turn-closing line, and a toast when tests pass or a commit or push lands. Off, only the band is themed. |
| PR status | off | The branch's pull request beside its git state, with its checks and review, from GitHub's CLI (`gh pr view`): after a push, and every five minutes while you are about. Off, the band names a pull request only once Claude opens or changes one. It is the one part of the mod that uses the network. |

## Make a theme

A theme is one file in `hooks/themes/`, plus its sounds: its pixel art, its colors, its words, its banner and its sounds. `hooks/theme.ts` documents every field.

1. Copy `hooks/themes/cat.ts` to `hooks/themes/<name>.ts` and rename the export.
2. Draw the mascot's face in a 14 × 10 grid, one character per pixel and `.` for transparent, and give each character a color in `palette`. Two pixels stack into one terminal cell, so the 18 × 10 sprite takes 18 × 5 cells. Keep the outline away from the edges of the shape: a dark outline disappears on a dark terminal.
3. Give `moodsOf` from `hooks/sprite.ts` the face and six expressions, each a few patches over it: `blink`, `lookLeft`, `lookRight`, `shock`, `happy` and `worried`. It builds all eight moods, with the shared emotes (`?`, `!`, `z`, sparkles, a sweat drop, a nyan trail) in columns 14 to 17. Those take the palette keys `y`, `r`, `g` and `b`, and the trail `RAINBOW`'s. To draw a mood of your own, spread the result and replace it, as `got.ts` does for its dragonfire.
4. Write its words: `quips` for each mood, `verbs` for each tool (`{}` stands for the file or command), and the `spinner`, `turn` and `party` lines.
5. Make its `banner`: up to 48 columns of ASCII art. An image-to-ASCII converter such as [asciiart.eu/image-to-ascii](https://www.asciiart.eu/image-to-ascii) turns a picture into one; use a picture you made or have the rights to.
6. Add its sounds: four short WAV files in `sounds/<name>/` (`done`, `error`, `waiting` and `party`), named in the theme's `sounds`. `scripts/sounds.py` shows how the built-in ones are synthesized.
7. Add it to `THEMES` in `hooks/themes/index.ts`, under any name but `files`, which `/awesome-hud files` takes, and its name to `userConfig.theme.options` in `.claude-plugin/plugin.json`.
8. Run `claude plugin test .`, which checks that every frame is a full grid of colors the palette knows, that the banner fits, and that every sound is named.

## Privacy

Everything runs on your machine unless you turn **PR status** on. The mod reads the figures Claude Code already shows (model, context, plan limits, cost); the output of the test commands Claude runs, from the file Claude Code saved it to when it was too long to show; the paths and line counts of the files Claude edits (to count them); the commits, pushes and pull requests Claude Code saw a command make; the session's agents; and the breakdown `/context` shows, counted locally. In the session's repository it runs `git rev-parse` once per folder, `git --no-optional-locks status` for the branch and the counts, and `git rev-list --count` for a branch with no upstream, and it reads git's own files: `HEAD`, the state a rebase or merge keeps, the config (for whether there is a remote at all), and the times of the files git writes on a commit, a checkout or a fetch. On Linux and Windows it runs a sound player on its own files. With **PR status** on, it also runs `gh pr view`, which asks GitHub about the branch's pull request; otherwise it makes no network requests. The only thing it saves is your settings in `/config`.

## Develop

```
git clone https://github.com/cosmos-127/awesome-hud
cd awesome-hud
claude --plugin-dir .
```

That session reloads the mod each time you save, and Claude Code writes the API's types to `.claude-plugin/types/`, which `tsconfig.json` extends for your editor and `tsc -p .`.

```
claude plugin test .        # the tests in hooks/awesome-hud.test.tsx
claude plugin validate .    # what Claude Code will load, and anything it would refuse
python3 scripts/sounds.py   # rebuild sounds/ from the recipes in the script
```

## License

[MIT](LICENSE)
