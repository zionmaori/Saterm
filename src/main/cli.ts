// Parsing for the `saterm` shell CLI's argv contract. The generated wrapper
// script (see cliInstall.ts) always execs the app as:
//   <exe> --saterm-cli <cwd> [subcommand] [args...]
// The sentinel makes this unambiguous against argv from other sources (e.g.
// Finder/Explorer "Open with Saterm", which never includes it) — see
// collectFilePathsFromArgv in index.ts for that other path.
export interface CliCommand {
  cwd: string
  tokens: string[]
}

const SENTINEL = '--saterm-cli'

export function parseCliArgv(argv: readonly string[]): CliCommand | null {
  if (argv.indexOf(SENTINEL) === -1) return null
  // Electron's single-instance forwarding rebuilds argv from Chromium's
  // CommandLine before delivering the 'second-instance' event: it groups all
  // switches (including ones Chromium injects itself, e.g.
  // --enable-avfoundation, --allow-file-access-from-files) ahead of all
  // positional args, so the token right after the sentinel is no longer
  // reliably our cwd. Positional args keep their relative order though, so
  // pull cwd/tokens from there instead of by adjacency to the sentinel.
  const positional = argv.slice(1).filter((a) => !a.startsWith('-'))
  if (positional.length === 0) return null
  const [cwd, ...tokens] = positional
  return { cwd, tokens }
}
