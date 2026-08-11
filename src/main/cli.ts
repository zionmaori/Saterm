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
  const idx = argv.indexOf(SENTINEL)
  if (idx === -1 || idx + 1 >= argv.length) return null
  return { cwd: argv[idx + 1], tokens: argv.slice(idx + 2) }
}
