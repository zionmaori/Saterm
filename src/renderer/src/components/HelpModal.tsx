import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

const YEAR = new Date().getFullYear()

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
            <h2>Keyboard Shortcuts</h2>
            <table className="help-table">
              <tbody>
                <tr><td><kbd>Ctrl K</kbd></td><td>Open command palette (search hosts &amp; projects)</td></tr>
                <tr><td><kbd>Ctrl P</kbd></td><td>Quick-open file in current project</td></tr>
                <tr><td><kbd>Ctrl B</kbd></td><td>Toggle sidebar</td></tr>
                <tr><td><kbd>Ctrl J</kbd></td><td>Toggle AI terminal copilot</td></tr>
                <tr><td><kbd>Ctrl S</kbd></td><td>Save current file (in editor)</td></tr>
                <tr><td><kbd>Ctrl Shift F</kbd></td><td>Search in project (ripgrep)</td></tr>
                <tr><td><kbd>Ctrl I</kbd></td><td>Toggle AI editor copilot (in project view)</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close palette / help / dialogs</td></tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Sidebar</h2>
            <p>
              The sidebar lists your SSH hosts and local projects in collapsible sections.
              Click any section header to expand or collapse it.
              Use <kbd>Ctrl B</kbd> or the panel button in the top-left to hide/show the sidebar.
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
                <strong>Terminal Copilot</strong> (<kbd>Ctrl J</kbd>) — chat about what's in your
                terminal. The AI can see recent output and suggest commands to run.
              </li>
              <li>
                <strong>Editor Copilot</strong> (<kbd>Ctrl I</kbd>) — chat about the file you're
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
