import { useState } from 'react'
import { ChevronRight, Folder, Server, Cloud, Check } from 'lucide-react'
import type {
  OnboardingImportSshResult,
  OnboardingStatus
} from '../../../shared/types'

interface Props {
  status: OnboardingStatus
  onFinish: () => void
}

type Step = 0 | 1 | 2 | 3

export default function OnboardingWizard({ status, onFinish }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>(0)
  const [detected, setDetected] = useState(status.detected)
  const [importCfg, setImportCfg] = useState(status.detected.sshConfig)
  const [importKnown, setImportKnown] = useState(status.detected.knownHosts)
  const [sshResult, setSshResult] = useState<OnboardingImportSshResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [finalCounts, setFinalCounts] = useState<{ projects: number } | null>(null)

  const next = (): void => setStep((s) => (Math.min(3, s + 1) as Step))
  const back = (): void => setStep((s) => (Math.max(0, s - 1) as Step))

  const pickRoot = async (): Promise<void> => {
    const r = await window.api.onboarding.pickProjectsRoot()
    if (!r) return
    setDetected((d) => ({
      ...d,
      projectsRoot: { path: r.path, exists: true, childCount: r.childCount }
    }))
  }

  const runSshImport = async (): Promise<void> => {
    if (busy) return
    if (!importCfg && !importKnown) {
      next()
      return
    }
    setBusy(true)
    try {
      const r = await window.api.onboarding.importSsh({
        importConfig: importCfg,
        importKnownHosts: importKnown
      })
      setSshResult(r)
    } finally {
      setBusy(false)
    }
    next()
  }

  const finish = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const seed = await window.api.onboarding.seedProjects()
      setFinalCounts({ projects: seed.added })
      await window.api.onboarding.complete()
    } finally {
      setBusy(false)
    }
    onFinish()
  }

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-modal" role="dialog" aria-modal="true">
        <div className="onboarding-header">
          <span className="onboarding-title">Welcome to Termion</span>
          <StepDots current={step} total={4} />
        </div>

        <div className="onboarding-body">
          {step === 0 && <StepWelcome />}
          {step === 1 && (
            <StepProjects
              root={detected.projectsRoot}
              onPick={() => void pickRoot()}
            />
          )}
          {step === 2 && (
            <StepSsh
              detected={detected}
              importCfg={importCfg}
              importKnown={importKnown}
              onToggleCfg={setImportCfg}
              onToggleKnown={setImportKnown}
              result={sshResult}
            />
          )}
          {step === 3 && (
            <StepAws detected={detected} finalCounts={finalCounts} />
          )}
        </div>

        <div className="onboarding-footer">
          <button className="onboarding-btn" onClick={back} disabled={step === 0 || busy}>
            Back
          </button>
          <div style={{ flex: 1 }} />
          {step < 2 && (
            <button className="onboarding-btn primary" onClick={next} disabled={busy}>
              Continue <ChevronRight size={14} />
            </button>
          )}
          {step === 2 && (
            <button
              className="onboarding-btn primary"
              onClick={() => void runSshImport()}
              disabled={busy}
            >
              {busy ? 'Importing…' : 'Continue'} <ChevronRight size={14} />
            </button>
          )}
          {step === 3 && (
            <button
              className="onboarding-btn primary"
              onClick={() => void finish()}
              disabled={busy}
            >
              {busy ? 'Finishing…' : 'Finish'} <Check size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDots({ current, total }: { current: number; total: number }): React.JSX.Element {
  return (
    <div className="onboarding-dots">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`onboarding-dot${i === current ? ' active' : i < current ? ' done' : ''}`}
        />
      ))}
    </div>
  )
}

function StepWelcome(): React.JSX.Element {
  return (
    <section className="onboarding-section">
      <h2>Get set up in a minute</h2>
      <p>
        Termion is a desktop terminal, SSH client, editor, and cloud console rolled into one.
        The next three steps will:
      </p>
      <ul>
        <li>Pick a folder for your projects</li>
        <li>Optionally import hosts from <code>~/.ssh/config</code> and <code>known_hosts</code></li>
        <li>Show what Termion found in your AWS / Kubernetes configuration</li>
      </ul>
      <p className="onboarding-note">
        Nothing is uploaded — all data stays in Termion’s local database. You can rerun any
        import later from the sidebar.
      </p>
    </section>
  )
}

function StepProjects({
  root,
  onPick
}: {
  root: { path: string; exists: boolean; childCount: number }
  onPick: () => void
}): React.JSX.Element {
  return (
    <section className="onboarding-section">
      <h2>
        <Folder size={14} strokeWidth={2} /> Projects folder
      </h2>
      <p>
        Termion will list the immediate subfolders of this directory in the sidebar so you can
        open them quickly. Pick your usual code root — you can always add more projects one at
        a time later.
      </p>
      <div className="onboarding-path-row">
        <code className="onboarding-path">{root.path}</code>
        <button className="onboarding-btn" onClick={onPick}>
          Change…
        </button>
      </div>
      <p className="onboarding-note">
        {root.exists ? (
          <>
            Found <strong>{root.childCount}</strong>{' '}
            {root.childCount === 1 ? 'folder' : 'folders'} that will be added as projects.
          </>
        ) : (
          <>Folder doesn’t exist yet — it will be created when you save a project there.</>
        )}
      </p>
    </section>
  )
}

function StepSsh({
  detected,
  importCfg,
  importKnown,
  onToggleCfg,
  onToggleKnown,
  result
}: {
  detected: OnboardingStatus['detected']
  importCfg: boolean
  importKnown: boolean
  onToggleCfg: (v: boolean) => void
  onToggleKnown: (v: boolean) => void
  result: OnboardingImportSshResult | null
}): React.JSX.Element {
  return (
    <section className="onboarding-section">
      <h2>
        <Server size={14} strokeWidth={2} /> Import SSH hosts
      </h2>
      <p>
        Termion can seed your host list from the two files most SSH users already have. Both
        are opt-in and only read — nothing is written back to your <code>~/.ssh</code>.
      </p>
      <label className="onboarding-choice">
        <input
          type="checkbox"
          checked={importCfg}
          disabled={!detected.sshConfig}
          onChange={(e) => onToggleCfg(e.target.checked)}
        />
        <span>
          <code>~/.ssh/config</code>{' '}
          {detected.sshConfig ? (
            <>— <strong>{detected.sshConfigHostCount}</strong> host entries detected</>
          ) : (
            <em className="onboarding-muted">— not found</em>
          )}
        </span>
      </label>
      <label className="onboarding-choice">
        <input
          type="checkbox"
          checked={importKnown}
          disabled={!detected.knownHosts}
          onChange={(e) => onToggleKnown(e.target.checked)}
        />
        <span>
          <code>~/.ssh/known_hosts</code>{' '}
          {detected.knownHosts ? (
            <>— <strong>{detected.knownHostsCount}</strong> unique hosts detected</>
          ) : (
            <em className="onboarding-muted">— not found</em>
          )}
        </span>
      </label>
      {result && (
        <p className="onboarding-note onboarding-success">
          <Check size={12} /> Imported{' '}
          {result.configAdded > 0 && (
            <>
              <strong>{result.configAdded}</strong> from config
            </>
          )}
          {result.configAdded > 0 && result.knownHostsAdded > 0 && ', '}
          {result.knownHostsAdded > 0 && (
            <>
              <strong>{result.knownHostsAdded}</strong> from known_hosts
            </>
          )}
          .
        </p>
      )}
    </section>
  )
}

function StepAws({
  detected,
  finalCounts
}: {
  detected: OnboardingStatus['detected']
  finalCounts: { projects: number } | null
}): React.JSX.Element {
  return (
    <section className="onboarding-section">
      <h2>
        <Cloud size={14} strokeWidth={2} /> AWS &amp; Kubernetes
      </h2>
      {detected.awsConfig || detected.awsCredentials ? (
        <>
          <p>
            Termion found <strong>{detected.awsProfileNames.length}</strong> AWS{' '}
            {detected.awsProfileNames.length === 1 ? 'profile' : 'profiles'} in your standard
            AWS config files:
          </p>
          <ul className="onboarding-list">
            {detected.awsProfileNames.slice(0, 8).map((p) => (
              <li key={p}>
                <code>{p}</code>
              </li>
            ))}
            {detected.awsProfileNames.length > 8 && (
              <li className="onboarding-muted">
                …and {detected.awsProfileNames.length - 8} more
              </li>
            )}
          </ul>
        </>
      ) : (
        <p>
          No AWS config found in <code>~/.aws/</code>. That’s fine — you can add profiles later
          and they’ll show up in the sidebar automatically.
        </p>
      )}
      <p className="onboarding-note">
        Your AWS profiles appear under the <strong>Kubernetes</strong> sidebar section — expand
        AWS, pick a profile, then a region to load its EKS clusters. Termion generates a fresh
        kubeconfig per cluster on demand and never modifies your{' '}
        <code>~/.kube/config</code>.
      </p>
      {finalCounts && (
        <p className="onboarding-success onboarding-note">
          <Check size={12} /> Added {finalCounts.projects}{' '}
          {finalCounts.projects === 1 ? 'project' : 'projects'} to the sidebar.
        </p>
      )}
    </section>
  )
}
