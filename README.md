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

### macOS

```bash
npm run build:mac           # produces dist/termion-<version>.dmg
```
The DMG is unsigned (personal use). Drag to /Applications. If macOS
quarantines it, run `xattr -d com.apple.quarantine /Applications/termion.app`.

### Windows

Build on a Windows machine (Windows 10 1809+ or Windows 11):

```powershell
git clone https://github.com/zionmaori/Termion C:\Projects\termion
cd C:\Projects\termion
npm install                 # postinstall rebuilds native modules
npm run build:win           # produces dist\termion-<version>-setup.exe
```

Prerequisites:
- **Node.js 20+** and **npm 10+**
- **Git for Windows** (provides `git.exe` for the Git panel)
- **OpenSSH agent service** running (Windows 10/11; check `Get-Service ssh-agent`)
- *Optional:* **Subversion** (`svn.exe` on PATH) for the SVN panel
- *Optional:* **ripgrep** for `⌘⇧F` search (`winget install BurntSushi.ripgrep.MSVC`)
- *Optional:* **Visual Studio Build Tools 2022** with the C++ workload — only
  needed if a prebuilt native module isn't available for your Node/Electron combo.
  Most installs don't need this.

Each `npm run build:win` bumps the patch version (`1.0.1` → `1.0.2`) so the
installer is named uniquely. SmartScreen will warn on first launch — click
**More info → Run anyway** (the installer is unsigned, same as the macOS DMG).

AI copilots: set `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` + the gateway
env vars) in your PowerShell `$PROFILE` *or* in System Properties → Environment
Variables. Termion reads from both on launch.

## Where data lives

| | macOS | Windows |
|---|---|---|
| DB | `~/Library/Application Support/Termion/termion.db` | `%APPDATA%\Termion\termion.db` |
| Secrets | macOS Keychain (service `Termion`) | Windows Credential Manager (target `Termion`) |
| SSH keys | `~/.ssh/*` | `%USERPROFILE%\.ssh\*` |
| SSH agent | `$SSH_AUTH_SOCK` | OpenSSH named pipe (`\\.\pipe\openssh-ssh-agent`) |

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
