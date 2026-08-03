import { spawn, spawnSync } from 'child_process'
import { getPath } from './shellEnv'

const IS_WIN = process.platform === 'win32'

function kubectlInstallHint(): string {
  if (IS_WIN) {
    return 'kubectl not found on PATH. Install with `winget install Kubernetes.kubectl` (or `choco install kubernetes-cli`) and reopen Saterm.'
  }
  if (process.platform === 'linux') {
    return 'kubectl not found on PATH. Install via your package manager (e.g. `apt install kubectl`) and reopen Saterm.'
  }
  return 'kubectl not found on PATH. Install with `brew install kubectl` and reopen Saterm.'
}

function shellQuote(a: string): string {
  if (!IS_WIN) return a
  if (a.length > 0 && !/[\s"^&|<>()%!]/.test(a)) return a
  return `"${a.replace(/"/g, '""')}"`
}

export interface KubeEnv {
  kubeconfigPath: string
  profile: string
  region: string
}

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function buildEnv(env: KubeEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getPath(),
    KUBECONFIG: env.kubeconfigPath,
    AWS_PROFILE: env.profile,
    AWS_REGION: env.region,
    AWS_DEFAULT_REGION: env.region
  }
}

function kubectlExists(env: KubeEnv): boolean {
  try {
    const r = spawnSync('kubectl', ['version', '--client=true', '--output=json'], {
      env: buildEnv(env),
      timeout: 4000,
      shell: IS_WIN,
      windowsHide: true
    })
    return r.status === 0
  } catch {
    return false
  }
}

function runKubectl(env: KubeEnv, args: string[], timeoutMs = 15_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>
    try {
      const spawnArgs = IS_WIN ? args.map(shellQuote) : args
      proc = spawn('kubectl', spawnArgs, {
        env: buildEnv(env),
        shell: IS_WIN,
        windowsHide: true
      })
    } catch (e) {
      reject(e)
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        proc.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, timeoutMs)
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    proc.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (e.code === 'ENOENT') {
        reject(new Error(kubectlInstallHint()))
      } else {
        reject(e)
      }
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({ code: -1, stdout, stderr: stderr || `kubectl timed out after ${timeoutMs}ms` })
      } else {
        resolve({ code: code ?? -1, stdout, stderr })
      }
    })
  })
}

function mapKubeError(stderr: string): string {
  const s = stderr.trim()
  if (!s) return 'kubectl failed (no output).'
  if (/unable to connect to the server|dial tcp/i.test(s)) {
    return 'Cannot reach the cluster API. The kubeconfig may be stale or your network is blocking the endpoint.'
  }
  if (/Unable to locate credentials|ExpiredToken|sso session/i.test(s)) {
    return 'AWS credentials expired. Re-run `aws sso login` for this profile and refresh.'
  }
  if (/forbidden|Error from server \(Forbidden\)/i.test(s)) {
    return `Access denied: ${s.split('\n')[0]}`
  }
  return s
}

/**
 * Run `kubectl get <resource> -o json` and return parsed JSON.
 * When `namespace` is omitted (or 'all'), uses `-A` to list across namespaces.
 * For cluster-scoped resources (nodes, namespaces, events at cluster level)
 * pass `cluster: true` to skip the namespace flag entirely.
 */
export async function kubectlGet(
  env: KubeEnv,
  resource: string,
  opts: { namespace?: string; cluster?: boolean } = {}
): Promise<unknown> {
  if (!kubectlExists(env)) {
    throw new Error(kubectlInstallHint())
  }
  const args = ['get', resource]
  if (opts.cluster) {
    /* no namespace flag */
  } else if (!opts.namespace || opts.namespace === 'all') {
    args.push('-A')
  } else {
    args.push('-n', opts.namespace)
  }
  args.push('-o', 'json')
  const r = await runKubectl(env, args)
  if (r.code !== 0) throw new Error(mapKubeError(r.stderr))
  try {
    return JSON.parse(r.stdout)
  } catch {
    throw new Error(`Could not parse kubectl JSON output for ${resource}.`)
  }
}
