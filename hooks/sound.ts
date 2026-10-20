import type { EngineInterface } from 'claude-code'

// $.audio plays only on macOS (afplay): a Linux or Windows terminal has no player there,
// so on Linux the first of these the host has plays the file, and on Windows PowerShell does.
const LINUX_PLAYERS: readonly (readonly string[])[] = [['pw-play'], ['paplay'], ['aplay', '-q']]

type Player = readonly string[] | 'engine' | 'windows' | null

// Found once per load; null where the host has none.
let player: Player | undefined

async function hostPlayer($: EngineInterface): Promise<Player> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  const os = await $.process.run(['uname', '-s'], { timeoutMs: 2_000 }).then(r => r.stdout.trim(), () => '')
  if (os === 'Darwin') return 'engine'
  for (const argv of LINUX_PLAYERS) {
    const isThere = await $.process.run([argv[0]!, '--version'], { timeoutMs: 2_000 }).then(r => r.exitCode === 0, () => false)
    if (isThere) return argv
  }
  return null
}

/** Plays one of the plugin's WAV files, `asset` relative to its folder; plays nothing where the host cannot. */
export async function play($: EngineInterface, asset: string) {
  try {
    if (player === undefined) player = await hostPlayer($)
    if (player === null) return
    if (player === 'engine') return await $.audio.play({ asset })
    const file = `${$.plugin.root}/${asset}`
    // shortcut: the Windows branch is untested; check it on a Windows terminal before relying on it.
    const argv = player === 'windows'
      ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`]
      : [...player, file]
    await $.process.run(argv, { timeoutMs: 10_000 })
  } catch {
    // A sound that cannot play is no reason to fail the hook that asked for it.
  }
}
