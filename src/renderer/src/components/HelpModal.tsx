import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

// Author's original copyright year — must not be changed in forks per LICENSE.
const COPYRIGHT_YEAR = 2026
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
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
          <span className="help-title">Saterm — Help &amp; Guide</span>
          <button className="help-close" onClick={onClose} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>

        <div className="help-body">
          <section className="help-section">
            <h2>What is Saterm?</h2>
            <p>
              Saterm is a desktop terminal and SSH client with an integrated code editor, version
              control panel, cloud tooling (AWS/EKS, Terraform), task manager, snippets, and AI
              assistant. It runs on Windows, Linux, and macOS.
            </p>
          </section>

          <section className="help-section">
            <h2>Opening &amp; closing panels</h2>
            <p>
              Every panel in Saterm has a shortcut <em>and</em> a button — if you accidentally
              close one, you can always bring it back the same way:
            </p>
            <table className="help-table">
              <tbody>
                <tr>
                  <td>
                    <strong>Sidebar</strong>
                    <br />
                    (hosts, tags, groups, projects)
                  </td>
                  <td>
                    <kbd>{modKey} B</kbd> · or click the <strong>panel icon</strong> at the top-left
                    of the titlebar.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Terminal Copilot</strong>
                    <br />
                    (AI chat about the active terminal)
                  </td>
                  <td>
                    <kbd>{modKey} J</kbd> toggles it. There is no button — only the shortcut.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Editor Copilot</strong>
                    <br />
                    (AI chat about the open file)
                  </td>
                  <td>
                    Only inside a project tab. <kbd>{modKey} I</kbd> toggles it.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Project Search</strong>
                    <br />
                    (ripgrep across the project)
                  </td>
                  <td>
                    Only inside a project tab. <kbd>{modKey} Shift F</kbd> opens it; <kbd>Esc</kbd>{' '}
                    closes it.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Help</strong> (this dialog)
                  </td>
                  <td>
                    Click the <strong>?</strong> button in the titlebar; <kbd>Esc</kbd> closes it.
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Finding &amp; opening things</h2>
            <table className="help-table">
              <tbody>
                <tr>
                  <td>
                    <kbd>{modKey} K</kbd>
                  </td>
                  <td>
                    <strong>Command palette</strong> — search hosts, projects, and commands.
                  </td>
                </tr>
                <tr>
                  <td>
                    <kbd>{modKey} P</kbd>
                  </td>
                  <td>
                    <strong>Quick-open file</strong> inside the current project.
                  </td>
                </tr>
                <tr>
                  <td>
                    <kbd>{modKey} F</kbd>
                  </td>
                  <td>
                    <strong>Focus sidebar search</strong> to filter hosts &amp; tags.
                  </td>
                </tr>
                <tr>
                  <td>
                    <kbd>{modKey} S</kbd>
                  </td>
                  <td>
                    <strong>Save</strong> the current file in the editor.
                  </td>
                </tr>
                <tr>
                  <td>
                    <kbd>Esc</kbd>
                  </td>
                  <td>Close any open palette, quick-open, search, or dialog.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Switching modes</h2>
            <p>
              Mode switches in Saterm are <em>click, not keystroke</em> — they live in the relevant
              panel's header. Here is where each switch is:
            </p>
            <table className="help-table">
              <tbody>
                <tr>
                  <td>
                    <strong>AI provider</strong>
                    <br />
                    (Claude / OpenAI / Gemini)
                  </td>
                  <td>Top of the open Copilot panel — click the provider name to pick another.</td>
                </tr>
                <tr>
                  <td>
                    <strong>AI model tier</strong>
                    <br />
                    (Opus / Sonnet / Haiku, or equivalents)
                  </td>
                  <td>Dropdown next to the provider selector in the Copilot header.</td>
                </tr>
                <tr>
                  <td>
                    <strong>Theme</strong>
                    <br />
                    (Light / System / Dark)
                  </td>
                  <td>
                    The <strong>☀ / ◻ / ☾</strong> buttons in the top-right of the titlebar.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Terminal position</strong>
                    <br />
                    (top / bottom of editor)
                  </td>
                  <td>
                    The <strong>↕</strong> button in the terminal header inside a project tab.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Git panel view</strong>
                    <br />
                    (Changes / History / Tags)
                  </td>
                  <td>Tabs in the Git panel header on the right side of a project tab.</td>
                </tr>
                <tr>
                  <td>
                    <strong>Tag filter mode</strong>
                    <br />
                    (AND / OR)
                  </td>
                  <td>
                    When 2+ tags are active in the sidebar, the AND / OR toggle appears under the
                    tag rail.
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="help-section">
            <h2>Sidebar</h2>
            <p>
              The sidebar lists your SSH hosts, projects, cloud resources, and snippets in
              collapsible sections. Click any section header to expand or collapse it. The{' '}
              <strong>collapse-all</strong> button next to the search box folds every section at
              once. Use <kbd>{modKey} B</kbd> or the panel button in the top-left to hide/show the
              sidebar itself.
            </p>
            <ul>
              <li>
                <strong>Pinned</strong> — hosts you've starred for quick access
              </li>
              <li>
                <strong>Recent</strong> — last-used hosts and projects
              </li>
              <li>
                <strong>Groups &amp; Tags</strong> — chips that filter the host list; click to
                toggle, ⌘-click to combine, use the AND/OR switch to change combine mode
              </li>
              <li>
                <strong>Hosts</strong> — all SSH connections, sortable by name or last-used
              </li>
              <li>
                <strong>Local</strong> — open a new local terminal
              </li>
              <li>
                <strong>Projects</strong> — code folders with editor + terminal. The{' '}
                <em>bot icon</em> next to each project opens a terminal in that folder and
                auto-runs the Claude Code CLI.
              </li>
              <li>
                <strong>AWS</strong> — configured AWS profiles; expand a profile to browse EKS
                clusters by region, open a kubeconfig-scoped terminal, or open the EKS dashboard
              </li>
              <li>
                <strong>Snippets</strong> — reusable command snippets that insert into the active
                terminal at the prompt
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h2>SSH Hosts</h2>
            <p>
              Add hosts manually or import from <code>~/.ssh/config</code> and{' '}
              <code>known_hosts</code>
              using the import button in the sidebar. Each host stores its password or passphrase
              securely in the OS keychain.
            </p>
            <p>
              Right-click a host to edit, pin, tag, or delete it. Tags let you filter and
              bulk-manage groups of servers.
            </p>
          </section>

          <section className="help-section">
            <h2>Projects</h2>
            <p>A project is a local folder opened in Saterm's split view:</p>
            <ul>
              <li>
                <strong>File tree</strong> (left) — browse, create, rename, and delete files
              </li>
              <li>
                <strong>Code editor</strong> (center) — Monaco-powered editor with syntax
                highlighting
              </li>
              <li>
                <strong>Terminal</strong> (top or bottom) — integrated local shell
              </li>
              <li>
                <strong>VCS panel</strong> (right) — Git or SVN status, diff, commit, branch, tag,
                push
              </li>
            </ul>
            <p>
              Click the <strong>↕</strong> button in the terminal header to move the terminal
              between the top and bottom of the editor. The shell dropdown lets you switch between
              available shells — on macOS/Linux it lists your login shell, zsh, bash, fish, sh; on
              Windows it lists PowerShell 7, Windows PowerShell, Git Bash, WSL, and cmd (whichever
              are installed).
            </p>
            <p>
              Tip: the <strong>bot icon</strong> next to each project in the sidebar opens a
              terminal in that project's directory and auto-runs the Claude Code CLI — when you
              exit Claude you land back at a working shell prompt.
            </p>
          </section>

          <section className="help-section">
            <h2>Right-side project panels</h2>
            <p>
              Inside a project tab, the right-hand panel has three tabs — click the header buttons
              to switch:
            </p>
            <ul>
              <li>
                <strong>VCS</strong> — Git or SVN operations (default).
              </li>
              <li>
                <strong>Terraform</strong> — appears when Saterm detects a Terraform root under
                the project (a <code>*.tf</code> file at any depth). Runs <code>terraform fmt</code>{' '}
                and <code>terraform validate</code>, shows diagnostics inline, and provides a{' '}
                <em>copy for AI</em> action so you can paste the raw files into Copilot.
              </li>
              <li>
                <strong>Tasks</strong> — a lightweight task manager scoped either globally or to
                the current project. Toggle the scope switch at the top; tasks persist between
                sessions. Set priority (Low / Normal / High), due date, and status (todo / doing /
                done). Filter by status or overdue.
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h2>AWS &amp; EKS</h2>
            <p>
              Saterm reads <code>~/.aws/config</code> and <code>~/.aws/credentials</code> and
              lists every profile in the sidebar's <strong>AWS</strong> section (SSO profiles too).
              Expand a profile to browse EKS clusters — pick a region from the dropdown or use the
              profile's default. For each cluster you can:
            </p>
            <ul>
              <li>
                <strong>Open a terminal</strong> pre-scoped to that cluster's kubeconfig — the tab
                has <code>KUBECONFIG</code> pointing at a temporary file so <code>kubectl</code>{' '}
                only sees this cluster, and it's cleaned up when you close the tab.
              </li>
              <li>
                <strong>Open the EKS dashboard tab</strong> — a browsable tree of nodes, namespaces,
                workloads, pods, services, ingresses, and events. Click any resource to see YAML,
                logs (for pods), or drill into related resources.
              </li>
            </ul>
            <p>
              The AWS status bar at the bottom of the sidebar shows the active profile/region.
              Click it to switch profiles or force a refresh (useful after <code>aws sso login</code>).
            </p>
          </section>

          <section className="help-section">
            <h2>Snippets</h2>
            <p>
              Snippets are named command blocks you can paste into any active terminal at the
              prompt (they don't auto-run unless you press Enter). Open the <strong>Snippets</strong>{' '}
              section in the sidebar and click <strong>+</strong> to create one:
            </p>
            <ul>
              <li>
                <strong>Title</strong> — how it appears in the sidebar.
              </li>
              <li>
                <strong>Body</strong> — the command(s) to insert.
              </li>
              <li>
                <strong>Host filter</strong> (optional) — only show this snippet in terminals for
                matching SSH hosts.
              </li>
              <li>
                <strong>Confirm before run</strong> — pop a confirmation dialog first (useful for
                destructive commands).
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h2>Bug reports</h2>
            <p>
              Click the <strong>bug icon</strong> in the sidebar footer to open the bug report
              dialog. It captures your description plus recent app logs and opens a pre-filled
              GitHub issue.
            </p>
          </section>

          <section className="help-section">
            <h2>Version Control (Git)</h2>
            <p>The Git panel in a project view has three tabs:</p>
            <ul>
              <li>
                <strong>Changes</strong> — stage/unstage files, view diffs, commit, push, pull,
                fetch
              </li>
              <li>
                <strong>History</strong> — browse recent commits with author and refs
              </li>
              <li>
                <strong>Tags</strong> — create lightweight or annotated tags, push tags to origin.
                Pushing a tag triggers GitHub Actions to build release installers automatically
                (Windows <code>.exe</code>, Linux <code>.AppImage</code> / <code>.deb</code>, macOS{' '}
                <code>.dmg</code>).
              </li>
            </ul>
          </section>

          <section className="help-section">
            <h2>AI Assistant</h2>
            <p>
              Saterm has a built-in AI panel that supports multiple providers. Click the AI button
              in a terminal or project tab to open the chat panel.
            </p>
            <h3>Signing in</h3>
            <ul>
              <li>
                <strong>Claude (Anthropic)</strong> — click <em>Continue with Claude Code</em> to
                use your existing Claude Code CLI credentials (no API credits needed), or enter a
                raw Anthropic API key.
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
                <strong>Terminal Copilot</strong> (<kbd>{modKey} J</kbd>) — chat about what's in
                your terminal. The AI can see recent output and suggest commands to run.
              </li>
              <li>
                <strong>Editor Copilot</strong> (<kbd>{modKey} I</kbd>) — chat about the file you're
                editing. Select code first to give the AI context; it can rewrite the file for you.
              </li>
            </ul>
            <h3>Rate limits</h3>
            <p>
              Rate limits are per account, not per app. If you use Claude.ai or the Claude Code CLI
              at the same time as Saterm, they share the same quota. Switch to a different provider
              or wait ~60 seconds for per-minute limits to reset.
            </p>
          </section>

          <section className="help-section">
            <h2>Theme</h2>
            <p>
              Use the <strong>☀ / ◻ / ☾</strong> buttons in the top-right of the titlebar to switch
              between Light, System (follows OS), and Dark themes. Your preference is saved
              automatically.
            </p>
          </section>

          <section className="help-section">
            <h2>Releasing / Publishing</h2>
            <p>
              If you're developing Saterm itself: open the Saterm project folder, go to the Git
              panel → <strong>Tags</strong> tab, create a tag (e.g. <code>v1.0.8</code>), then click
              <em>Push tags →</em>. GitHub Actions will automatically build Windows, Linux, and
              macOS installers and upload them as a draft release.
            </p>
          </section>
        </div>

        <div className="help-footer">
          <span>
            © {COPYRIGHT_YEAR} <strong>Zion Maor</strong>. All rights reserved. Licensed under a
            proprietary license — see LICENSE.
          </span>
          <span className="help-footer-version">Saterm</span>
        </div>
      </div>
    </div>
  )
}
