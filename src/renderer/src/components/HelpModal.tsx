import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

const YEAR = new Date().getFullYear()
const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
const modKey = isMac ? '⌘' : 'Ctrl'

export default function HelpModal({ onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span className="help-title">Termion — Help &amp; Guide</span>
          <button className="help-close" onClick={onClose} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>

        <div className="help-body">

          <section className="help-section">
            <h2>What is Termion?</h2>
            <p>
              Termion is a desktop terminal and SSH client with an integrated code editor,
              version control panel, and AI assistant. It runs on Windows, Linux, and macOS.
            </p>
          </section>

          <section className="help-section">
            <h2>Opening &amp; closing panels</h2>
            <p>
              Every panel in Termion has a shortcut <em>and</em> a button — if you accidentally close
              one, you can always bring it back the same way:
            </p>
            <table className="help-table">
              <tbody>
                <tr>
                  <td><strong>Sidebar</strong><br/>(hosts, tags, groups, projects)</td>
                  <td><kbd>{modKey} B</kbd> · or click the <strong>panel icon</strong> at the top-left of the titlebar.</td>
                </tr>
                <tr>
                  <td><strong>Terminal Copilot</strong><br/>(AI chat about the active terminal)</td>
                  <td><kbd>{modKey} J</kbd> toggles it. There is no button — only the shortcut.</td>
                </tr>
                <tr>
                  <td><strong>Editor Copilot</strong><br/>(AI chat about the open file)</td>
                  <td>Only inside a project tab. <kbd>{modKey} I</kbd> toggles it.</td>
                </tr>
                <tr>
                  <td><strong>Project Search</strong><br/>(ripgrep across the project)</td>
                  <td>Only inside a project tab. <kbd>{modKey} Shift F</kbd> opens it; <kbd>Esc</kbd> closes it.</td>
                </tr>
                <tr>
                  <td><strong>Help</strong> (this dialog)</td>
                  <td>Click the <strong>?</strong> button in the titlebar; <kbd>Esc</kbd> closes it.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Finding &amp; opening things</h2>
            <table className="help-table">
              <tbody>
                <tr>
                  <td><kbd>{modKey} K</kbd></td>
                  <td><strong>Command palette</strong> — search hosts, projects, and commands.</td>
                </tr>
                <tr>
                  <td><kbd>{modKey} P</kbd></td>
                  <td><strong>Quick-open file</strong> inside the current project.</td>
                </tr>
                <tr>
                  <td><kbd>{modKey} F</kbd></td>
                  <td><strong>Focus sidebar search</strong> to filter hosts &amp; tags.</td>
                </tr>
                <tr>
                  <td><kbd>{modKey} S</kbd></td>
                  <td><strong>Save</strong> the current file in the editor.</td>
                </tr>
                <tr>
                  <td><kbd>Esc</kbd></td>
                  <td>Close any open palette, quick-open, search, or dialog.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Switching modes</h2>
            <p>
              Mode switches in Termion are <em>click, not keystroke</em> — they live in the relevant
              panel's header. Here is where each switch is:
            </p>
            <table className="help-table">
              <tbody>
                <tr>
                  <td><strong>AI provider</strong><br/>(Claude / OpenAI / Gemini)</td>
                  <td>Top of the open Copilot panel — click the provider name to pick another.</td>
                </tr>
                <tr>
                  <td><strong>AI model tier</strong><br/>(Opus / Sonnet / Haiku, or equivalents)</td>
                  <td>Dropdown next to the provider selector in the Copilot header.</td>
                </tr>
                <tr>
                  <td><strong>Theme</strong><br/>(Light / System / Dark)</td>
                  <td>The <strong>☀ / ◻ / ☾</strong> buttons in the top-right of the titlebar.</td>
                </tr>
                <tr>
                  <td><strong>Terminal position</strong><br/>(top / bottom of editor)</td>
                  <td>The <strong>↕</strong> button in the terminal header inside a project tab.</td>
                </tr>
                <tr>
                  <td><strong>Git panel view</strong><br/>(Changes / History / Tags)</td>
                  <td>Tabs in the Git panel header on the right side of a project tab.</td>
                </tr>
                <tr>
                  <td><strong>Tag filter mode</strong><br/>(AND / OR)</td>
                  <td>When 2+ tags are active in the sidebar, the AND / OR toggle appears under the tag rail.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Sidebar</h2>
            <p>
              The sidebar lists your SSH hosts and local projects in collapsible sections.
              Click any section header to expand or collapse it.
              Use <kbd>{modKey} B</kbd> or the panel button in the top-left to hide/show the sidebar.
            </p>
            <ul>
              <li><strong>Pinned</strong> — hosts you've starred for quick access</li>
              <li><strong>Recent</strong> — last-used hosts and projects</li>
              <li><strong>Hosts</strong> — all SSH connections grouped by type</li>
              <li><strong>Local</strong> — local terminal sessions</li>
              <li><strong>Projects</strong> — code folders with editor + terminal</li>
            </ul>
          </section>

          <section className="help-section">
            <h2>SSH Hosts</h2>
            <p>
              Add hosts manually or import from <code>~/.ssh/config</code> and <code>known_hosts</code>
              using the import button in the sidebar. Each host stores its password or
              passphrase securely in the OS keychain.
            </p>
            <p>
              Right-click a host to edit, pin, tag, or delete it.
              Tags let you filter and bulk-manage groups of servers.
            </p>
          </section>

          <section className="help-section">
            <h2>Projects</h2>
            <p>
              A project is a local folder opened in Termion's split view:
            </p>
            <ul>
              <li><strong>File tree</strong> (left) — browse, create, rename, and delete files</li>
              <li><strong>Code editor</strong> (center) — Monaco-powered editor with syntax highlighting</li>
              <li><strong>Terminal</strong> (top or bottom) — integrated local shell</li>
              <li><strong>VCS panel</strong> (right) — Git or SVN status, diff, commit, branch, tag, push</li>
            </ul>
            <p>
              Click the <strong>↕</strong> button in the terminal header to move the terminal
              between the top and bottom of the editor. The shell dropdown lets you switch
              between available shells (PowerShell, Git Bash, cmd, WSL…).
            </p>
          </section>

          <section className="help-section">
            <h2>Version Control (Git)</h2>
            <p>
              The Git panel in a project view has three tabs:
            </p>
            <ul>
              <li><strong>Changes</strong> — stage/unstage files, view diffs, commit, push, pull, fetch</li>
              <li><strong>History</strong> — browse recent commits with author and refs</li>
              <li>
                <strong>Tags</strong> — create lightweight or annotated tags, push tags to origin.
                Pushing a tag triggers GitHub Actions to build release installers automatically
                (Windows <code>.exe</code>, Linux <code>.AppImage</code> / <code>.deb</code>, macOS <code>.dmg</code>).
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h2>AI Assistant</h2>
            <p>
              Termion has a built-in AI panel that supports multiple providers. Click the AI
              button in a terminal or project tab to open the chat panel.
            </p>
            <h3>Signing in</h3>
            <ul>
              <li>
                <strong>Claude (Anthropic)</strong> — click <em>Continue with Claude Code</em> to use
                your existing Claude Code CLI credentials (no API credits needed), or enter a raw
                Anthropic API key.
              </li>
              <li>
                <strong>OpenAI (GPT)</strong> — enter your OpenAI API key. Get one at
                platform.openai.com.
              </li>
              <li>
                <strong>Gemini (Google)</strong> — enter your Google AI API key. Get one at
                aistudio.google.com.
              </li>
            </ul>
            <h3>Copilot modes</h3>
            <ul>
              <li>
                <strong>Terminal Copilot</strong> (<kbd>{modKey} J</kbd>) — chat about what's in your
                terminal. The AI can see recent output and suggest commands to run.
              </li>
              <li>
                <strong>Editor Copilot</strong> (<kbd>{modKey} I</kbd>) — chat about the file you're
                editing. Select code first to give the AI context; it can rewrite the file for you.
              </li>
            </ul>
            <h3>Rate limits</h3>
            <p>
              Rate limits are per account, not per app. If you use Claude.ai or the Claude Code CLI
              at the same time as Termion, they share the same quota. Switch to a different provider
              or wait ~60 seconds for per-minute limits to reset.
            </p>
          </section>

          <section className="help-section">
            <h2>Theme</h2>
            <p>
              Use the <strong>☀ / ◻ / ☾</strong> buttons in the top-right of the titlebar to switch
              between Light, System (follows OS), and Dark themes. Your preference is saved automatically.
            </p>
          </section>

          <section className="help-section">
            <h2>Releasing / Publishing</h2>
            <p>
              If you're developing Termion itself: open the Termion project folder, go to the Git
              panel → <strong>Tags</strong> tab, create a tag (e.g. <code>v1.0.8</code>), then click
              <em>Push tags →</em>. GitHub Actions will automatically build Windows, Linux, and macOS
              installers and upload them as a draft release.
            </p>
          </section>

        </div>

        <div className="help-footer">
          <span>© {YEAR} Zion Maor. All rights reserved.</span>
          <span className="help-footer-version">Termion</span>
        </div>
      </div>
    </div>
  )
}
