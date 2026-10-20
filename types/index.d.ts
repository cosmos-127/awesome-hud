export type Mood = 'idle' | 'working' | 'waiting' | 'error' | 'done' | 'party' | 'sweat' | 'asleep'

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** The figures the status bar draws, refreshed by `session.measure`. */
export type Meter = {
  startedAt: number
  contextPercent?: number
  limits: Limit[]
  costUsd?: number
}

/** What takes the most of the context, as /context names it. */
export type Eater = { name: string; tokens: number }

/** Where auto-compact starts as a percent of the window, null when it is off, as the context breakdown said. */
export type Compaction = { at: number | null }

/** The tools running now, for the quip to name, each with when it started. */
export type Activity = { running: { id: string; name: string; target?: string; startedAt: number }[] }

/** A git operation stopped halfway, as the git dir records it: a rebase's or `git am`'s step of how many. */
export type GitOp = { kind: 'rebase' | 'am' | 'merge' | 'cherry-pick' | 'revert' | 'bisect'; step?: number; of?: number }

/**
 * The repository the session runs in: the branch (null when HEAD is detached, `oid` then naming its commit), what git
 * is in the middle of, the upstream and the commits ahead of and behind it (with none, ahead counts what no remote
 * has), the tree's paths by kind, the stashes, and the linked worktree the session is in.
 */
export type Git = {
  branch: string | null
  oid: string | null
  op: GitOp | null
  upstream: 'tracking' | 'none' | 'gone'
  ahead: number
  behind: number
  /** True when the last fetch is over a day old: `behind` counts only what that fetch saw. */
  isFetchStale: boolean
  staged: number
  unstaged: number
  /** Null when the status left untracked files out: one that ran out of time is run again without them. */
  untracked: number | null
  conflicts: number
  stashes: number
  worktree: { name: string; project: string } | null
  /** True when the counts are an earlier status's, the last one not having finished. */
  isStale: boolean
}

/** A changed path as git has it, for `/awesome-hud files`. */
export type PathState = 'staged' | 'modified' | 'new' | 'deleted' | 'conflict'

/** A file an edit tool wrote this session: how many times, the lines added and removed, when last, and whether it lies in the project. */
export type FileEdit = { path: string; edits: number; added: number; removed: number; at: number; isInProject: boolean }

/** A commit made this session, as Claude Code read the command that made it. */
export type Commit = { sha: string; kind: string; branch?: string; at: number }

/** The branch's pull request: from a `gh pr` command Claude ran, and with PR status on, `gh pr view`'s checks and review too. */
export type Pr = {
  number: number
  url?: string
  state: 'open' | 'draft' | 'merged' | 'closed'
  /** The branch it was read on: a switch to another hides it. */
  branch: string | null
  checks?: { failed: number; pending: number; passed: number }
  review?: 'approved' | 'changes'
}

/** The last test run's summary: how many passed and failed, when it ended, its command, and that command's counts the run before. */
export type TestRun = { passed: number; failed: number; at: number; command: string; was?: { passed: number; failed: number } }

/** An agent that failed, named at rest until the person's next prompt has seen it. */
export type AgentFailure = { id: string; task: string; isDismissed: boolean }

/** What `/awesome-hud files` reported, drawn under its line: the files, git's state of each (null when unread), the commits and the PR. */
export type FilesReport = { root: string; home: string | null; files: FileEdit[]; paths: Record<string, PathState> | null; commits: Commit[]; pr: Pr | null }

/** What a finished turn held, by its duration, for the line that closes it. */
export type TurnNote = { errors: number; isParty: boolean }

declare module 'claude-code' {
  interface PluginState {
    'awesome-hud': {
      theme: string
      mood: Mood
      quip: string
      effort: string | null
      meter: Meter | null
      minute: number
      activity: Activity
      git: Git | null
      tests: TestRun | null
      /** Every file an edit tool wrote this session, by path, with its edits and lines. */
      files: FileEdit[]
      /** When an edit tool last wrote a file in the project, in epoch ms; 0 before any did. */
      editedAt: number
      /** The biggest consumer at the last turn end that found the context 70% full or more. */
      eater: Eater | null
      /** Where auto-compact starts; null until the context breakdown has been counted. */
      compaction: Compaction | null
      /** The task of each agent at work now, oldest first. */
      agents: string[]
      failures: AgentFailure[]
      /** The commits made this session, oldest first. */
      commits: Commit[]
      pr: Pr | null
      /** The last few `/awesome-hud files` reports, by the line each printed. */
      reports: Record<string, FilesReport>
      /** Context percent at the end of each recent turn, oldest first. */
      contextHistory: number[]
      turnNotes: Record<string, TurnNote>
    }
  }
}
