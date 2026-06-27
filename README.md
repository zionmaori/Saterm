# Termion

A personal macOS hub for SSH connections, terminal sessions, and Git/SVN projects.

## What it does

- **SSH** — tab a host, get a real interactive shell. Import existing
  `~/.ssh/config` hosts in one click. Password/passphrase prompts go through
  macOS Keychain. ProxyJump bastions supported.
- **Local terminals** — spawned with `node-pty`, your shell, your env.
- **Projects** — pick a folder, get a VSCode-style view: file tree, Monaco
  editor, Git/SVN panel, terminal at the bottom rooted in the project.
- **Git panel** — status, stage / unstage, diff (Monaco), commit, branch
  switch, fetch / pull / push, log.
- **SVN panel** — status, diff, commit, update, revert, log against the
  system `svn` CLI.
- **⌘K** command palette · **⌘P** quick-open · **⌘⇧F** project search (ripgrep).
- **AI copilots** — Claude-backed:
  - **⌘J** Terminal copilot — reads the active terminal's recent output, drafts commands
    via a tool call. Every proposed command runs a renderer-side safety check (sudo /
    `rm -rf` / `git push --force` / `kubectl delete` / `DROP TABLE` / etc.) and dangerous
    proposals require typing `YES` before the **Insert** button is enabled. The Insert
    button writes the command into the prompt — it does NOT execute it.
  - **⌘I** Editor copilot — tied to the file open in Monaco. Selection-aware. Diffs
    return through a `propose_edit` tool; the renderer applies the unified diff with
    fuzzy hunk matching and shows a side-by-side review before any write.
  - Set `ANTHROPIC_API_KEY` in your shell before launching. Default model `claude-opus-4-8`.

## Setup

Tooling already present on this Mac: Node 23, npm, git, svn, Xcode CLT.
Recommended (for `⌘⇧F` search): `brew install ripgrep`.

```bash
cd /Users/zmaor/Projects/termion
npm install                 # only first time
npm run dev                 # launches the app
```

If you change Node version or upgrade Electron, rebuild native modules:
```bash
npx electron-builder install-app-deps
```

## Build a distributable

```bash
npm run build:mac           # produces dist/Termion-<version>-arm64.dmg
```
The DMG is unsigned (personal use). Drag to /Applications. If macOS
quarantines it, run `xattr -d com.apple.quarantine /Applications/termion.app`.

## Where data lives

- **DB** (hosts, projects, layout): `~/Library/Application Support/Termion/termion.db`
- **Secrets**: macOS Keychain, service `Termion`, account `ssh:<id>:password|passphrase`
- **SSH keys**: read straight from the paths in `~/.ssh/config` or the host form.

## Layout

```
src/
  shared/types.ts         # types crossing process boundaries
  main/                   # Node-side: SSH (ssh2), PTY (node-pty), git, svn, sqlite, keychain
  preload/index.ts        # contextBridge surface exposed as window.api
  renderer/src/           # React UI
    store/app.ts          # Zustand store: hosts, projects, tabs, layout
    components/           # Sidebar, TabBar, TerminalPane, ProjectView, GitPanel, SvnPanel, …
```

Built with electron-vite, React 19, xterm.js, Monaco, simple-git.
