# Security policy

## Reporting a vulnerability

This repository has no private reporting channel, so how to report depends on what you found:

- A freeze or crash, or text that misleads: open an ordinary [issue](https://github.com/cosmos-127/awesome-hud/issues/new/choose).
- Anything that could run code, touch files the mod is not documented to, or leak something from a session: open an issue that says only that you have a security report, with no details, and ask for a private way to send it.

What counts: a way to make the mod run code or touch files it is not documented to, to freeze or crash Claude Code with text that a repository, a command, or a test run can produce, to make the HUD draw text that misleads or terminal control sequences, or to leak anything from a session.

Out of scope: weaknesses in Claude Code, `git`, or `gh` themselves, and code that a repository or its tests already run on their own.

## Supported versions

Only the latest release is supported. See [Update](README.md#update) in the README for how to update.

## What the mod can do

awesome-hud is a Claude Code mod: it runs inside Claude Code with your permissions and is not sandboxed. [Security and privacy](README.md#security-and-privacy) lists everything it runs, reads, writes, and sends, and `claude plugin validate .` prints the same from the source. In short:

- Every hook only observes. None changes a prompt, a tool call, a permission decision, or the system prompt. Each one Claude Code treats as able to refuse something ends in `.catch(($, e, next) => next(e))`, so a fault in the HUD never blocks Claude.
- It makes no network request of its own. With **PR status** on, `gh pr view` makes one, with your own sign-in.
- It writes one setting, `awesome-hud.theme`, and sets no environment variable.
- It has no dependencies to install, and no install or post-install script.

## Review history

**2026-10-21**, version 0.4.0: the source read in full; `claude plugin validate`; a scan of the tree and of the git history for secrets; fuzzing of the text parsers; and a hostile repository run against Claude Code 2.1.306.

Fixed in 0.4.1:

- Six groups of regular expressions, in `hooks/format.ts` and `hooks/register.tsx`, could take seconds to hours on text that a command, a test run, or a repository can produce (50 KB of blank lines in a test run's output took 12 seconds, and a `git` command of 108 characters took two, with the time growing sevenfold for every 12 characters more). They now run in linear time, and a regression test holds them to it.
- A tool or a file named like a member every object has (`constructor`, `toString`) stopped the band from drawing, or `/awesome-hud files` from running. Names are now looked up as own keys only.
- The folder name and the context breakdown's names were drawn unchecked, and `clean` let direction-changing and zero-width characters through. Claude Code refuses to draw a band with a control character in it, so a folder named with one hid the HUD.

Checked and found fine:

- No secrets in the tree or in the history.
- `git` runs through Claude Code with the repository's hooks and `core.fsmonitor` switched off: a repository whose own config names a program to run did not run it. `gh pr view` did not run it either.
- The sound players get fixed arguments, and the Windows file path goes in an environment variable, never in the script.
