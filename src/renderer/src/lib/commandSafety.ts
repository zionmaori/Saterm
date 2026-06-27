// Detect dangerous shell commands so the UI can require explicit confirmation
// before inserting them into a terminal. This runs on the renderer because the
// guard sits between the AI proposal and the keystroke that types it into the
// shell — the user is the last line of defense, and the model's instructions
// are not load-bearing here.

export type Severity = 'safe' | 'caution' | 'dangerous'

export interface SafetyVerdict {
  severity: Severity
  reasons: string[]
}

// Patterns are checked against the whole command string. They're intentionally
// broad — false positives just require the user to type "YES" to confirm.
const DANGEROUS_PATTERNS: { re: RegExp; reason: string }[] = [
  // sudo / privilege escalation
  { re: /\bsudo\b/, reason: 'Uses sudo (privilege escalation)' },
  { re: /\bdoas\b/, reason: 'Uses doas (privilege escalation)' },
  { re: /\bsu\s+(-|root|\w)/, reason: 'Switches user (su)' },
  { re: /\bsetuid\b/, reason: 'Sets uid' },

  // recursive / forced deletion
  { re: /\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*\s|[^|;]*--recursive|[^|;]*--force)/, reason: 'rm -rf style recursive/forced delete' },
  { re: /\brm\s+-[a-zA-Z]*\s+\/(\s|$)/, reason: 'rm against /' },
  { re: /\brmdir\s+--ignore-fail/, reason: 'rmdir ignoring failures' },
  { re: /\bfind\b.*-delete\b/, reason: 'find ... -delete' },
  { re: /\bfind\b.*-exec\s+rm\b/, reason: 'find ... -exec rm' },
  { re: /\bshred\b/, reason: 'shred (destructive overwrite)' },

  // disk / filesystem
  { re: /\bdd\b.*of=\/dev\//, reason: 'dd writing to a device' },
  { re: /\bmkfs(\.\w+)?\b/, reason: 'mkfs (format filesystem)' },
  { re: /\bfdisk\b/, reason: 'fdisk' },
  { re: /\bparted\b/, reason: 'parted' },
  { re: /\bdiskutil\s+(eraseDisk|eraseVolume|secureErase)/, reason: 'diskutil erase' },
  { re: /:\(\)\{\s*:\|\s*:&\s*\};:/, reason: 'fork bomb' },

  // system control
  { re: /\b(shutdown|halt|poweroff|reboot|init\s+0|init\s+6)\b/, reason: 'system shutdown/reboot' },
  { re: /\bkill\s+-9\s+1\b/, reason: 'killing PID 1' },
  { re: /\bkillall\s+-9\b/, reason: 'killall -9' },
  { re: /\bsystemctl\s+(stop|disable|mask)\b/, reason: 'systemctl stop/disable' },

  // package / kernel
  { re: /\b(apt|apt-get|yum|dnf|brew|pacman|zypper)\s+(remove|purge|autoremove)/, reason: 'package removal' },
  { re: /\b(modprobe|insmod|rmmod)\b/, reason: 'kernel module manipulation' },

  // remote pipe-to-shell — running arbitrary code from the internet
  { re: /\bcurl\b[^|;]*\|\s*(sudo\s+)?(sh|bash|zsh|fish)/, reason: 'curl | sh (executes remote script)' },
  { re: /\bwget\b[^|;]*\|\s*(sudo\s+)?(sh|bash|zsh|fish)/, reason: 'wget | sh (executes remote script)' },
  { re: /\bwget\b.*-O-/, reason: 'wget -O- (often piped to shell)' },

  // version control destruction
  { re: /\bgit\s+push\s+(-f|--force)/, reason: 'git force-push' },
  { re: /\bgit\s+push\b.*(--force-with-lease)?.*\b(main|master|prod|production)\b/, reason: 'push to protected branch' },
  { re: /\bgit\s+reset\s+--hard\b/, reason: 'git reset --hard' },
  { re: /\bgit\s+clean\s+-[a-z]*f/, reason: 'git clean -f' },
  { re: /\bgit\s+branch\s+-D\b/, reason: 'git branch -D (force delete)' },

  // database
  { re: /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i, reason: 'SQL DROP' },
  { re: /\bTRUNCATE\s+TABLE\b/i, reason: 'SQL TRUNCATE' },
  { re: /\bDELETE\s+FROM\b(?!.*WHERE)/i, reason: 'DELETE without WHERE' },

  // permissions / ownership wide changes
  { re: /\bchmod\s+(-R\s+)?[0-7]{3,4}\s+\/(\s|$)/, reason: 'chmod against /' },
  { re: /\bchown\s+-R\b.*\/(\s|$)/, reason: 'recursive chown of /' },

  // remote infra
  { re: /\b(terraform|tf)\s+(destroy|apply)\b.*\b(prod|production)/, reason: 'terraform destroy/apply against prod' },
  { re: /\bkubectl\s+delete\b/, reason: 'kubectl delete' },
  { re: /\baws\s+\S+\s+delete/, reason: 'aws delete' },
  { re: /\bgcloud\s+\S+\s+delete/, reason: 'gcloud delete' },

  // path traversal / overwrite of critical files
  { re: />\s*\/etc\//, reason: 'redirect to /etc' },
  { re: />\s*\/dev\/sd[a-z]/, reason: 'redirect to raw disk device' },
  { re: />\s*\/boot\//, reason: 'redirect to /boot' }
]

const CAUTION_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\bchmod\s+777\b/, reason: 'chmod 777 (world-writable)' },
  { re: /\bnpm\s+(uninstall|rm|remove)\b/, reason: 'npm uninstall' },
  { re: /\b(npm|pnpm|yarn)\s+publish\b/, reason: 'package publish' },
  { re: /\bdocker\s+(rm|rmi)\s+-f\b/, reason: 'docker rm -f' },
  { re: /\bdocker\s+system\s+prune\b/, reason: 'docker system prune' },
  { re: /\bgit\s+rebase\s+-i\b/, reason: 'interactive rebase (rewrites history)' },
  { re: /\btruncate\b/, reason: 'truncate' },
  { re: /\b>\s*[^\s|&;`)]+/, reason: 'redirects (>) — overwrites the target file' }
]

export function classifyCommand(command: string): SafetyVerdict {
  const c = command.trim()
  if (!c) return { severity: 'safe', reasons: [] }
  const reasons: string[] = []
  let severity: Severity = 'safe'

  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(c)) {
      reasons.push(reason)
      severity = 'dangerous'
    }
  }
  if (severity !== 'dangerous') {
    for (const { re, reason } of CAUTION_PATTERNS) {
      if (re.test(c)) {
        reasons.push(reason)
        severity = 'caution'
      }
    }
  }
  return { severity, reasons }
}

export const SAFETY_LABELS: Record<Severity, string> = {
  safe: 'Safe',
  caution: 'Review',
  dangerous: 'Dangerous'
}

/**
 * For dangerous commands, require the user to type this exact phrase before we
 * insert them into the terminal. Mirrors what production tools (gh, doctl, etc.)
 * do for irreversible operations.
 */
export const DANGEROUS_CONFIRM_PHRASE = 'YES'
