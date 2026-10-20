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

/** The tools running now, for the quip to name, each with when it started. */
export type Activity = { running: { id: string; name: string; target?: string; startedAt: number }[] }

/** The branch, whether the tree has uncommitted changes, and commits ahead of and behind the upstream. */
export type Git = { branch: string; isDirty: boolean; ahead: number; behind: number }

/** The last test run's summary: how many passed and failed, and when it ended. */
export type TestRun = { passed: number; failed: number; at: number }

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
      /** Every file an edit tool wrote this session, by path. */
      edited: string[]
      /** When an edit tool last wrote a file, in epoch ms; 0 before any did. */
      editedAt: number
      /** The biggest consumer at the last turn end that found the context 70% full or more. */
      eater: Eater | null
      /** The task of each agent at work now, oldest first. */
      agents: string[]
      /** Context percent at the end of each recent turn, oldest first. */
      contextHistory: number[]
      turnNotes: Record<string, TurnNote>
    }
  }
}
