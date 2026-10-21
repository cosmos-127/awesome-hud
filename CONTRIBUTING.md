# Contributing

Bug reports, theme ideas, and fixes are welcome. For a security problem, read [SECURITY.md](SECURITY.md) first.

## Set up

```sh
git clone https://github.com/cosmos-127/awesome-hud
cd awesome-hud
claude --plugin-dir .       # loads the mod, and reloads it each time you save
```

There is nothing to install: the mod has no dependencies.

## Before you open a pull request

```sh
claude plugin test .              # the tests in hooks/awesome-hud.test.tsx
claude plugin validate --strict . # what Claude Code will load, and anything it would refuse
```

- Add a test for what you change, in `hooks/awesome-hud.test.tsx`. A fix for a bug gets a test that fails without it.
- Write like the code around yours: its names, its comments, and how much of each.
- Keep the mod free of dependencies, and keep what it runs, reads, and writes in step with the README's [Security and privacy](README.md#security-and-privacy) table. A new process, a file it reads, or anything that uses the network needs a line there, and a setting that is off by default.
- Text that a repository, a command, or a test run can shape (names, paths, output) goes through `clean` before it is drawn. A pattern that reads such text must run in linear time: no `\s*` or `.*` after `^` in a multi-line pattern, and no quantifiers that can split the same text two ways. The test "text built to make a parser backtrack cannot stall it" shows what to try.
- A new theme follows "Make a theme" in the README.
