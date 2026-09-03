#!/usr/bin/env node
// PreToolUse guard for the Viva repo. Enforces the AGENTS.md supreme rule:
// main auto-deploys vivawellnessco.com, so only Michael promotes to main.
// Reads the hook payload on stdin and denies shell commands that would
// commit to, merge into, rebase, or push the main branch, and direct
// wrangler deploys to the live Pages project. Everything else exits 0.
import { execSync } from 'node:child_process';

const raw = await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (chunk) => (data += chunk));
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', () => resolve(''));
});

let cmd = '';
try {
  cmd = JSON.parse(raw)?.tool_input?.command ?? '';
} catch {
  // Fail-open by design, but make the disarm visible in transcripts.
  process.stderr.write('guard-main.mjs: could not parse hook payload; guard skipped for this call\n');
  process.exit(0);
}
if (typeof cmd !== 'string' || !/\b(git|wrangler)\b/.test(cmd)) process.exit(0);

// Backslash line continuations join a logical command; after that, a newline
// separates shell commands exactly like ';' and must bound every segment scan.
cmd = cmd.replace(/\\\r?\n/g, ' ');
const SEG = String.raw`[^&|;\n]*`;

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

// "main" as its own ref token: preceded by start/space/:/=/quote//, not part of
// a longer name like feat/main-page or maintenance.
const MAIN_REF = String.raw`(^|[^\w-])main([^\w-]|$)`;

// 1) Any push whose same shell segment names main (git push origin main,
//    git push origin HEAD:main, refs/heads/main, --force variants).
if (new RegExp(String.raw`\bpush\b` + SEG + MAIN_REF).test(cmd)) {
  deny(
    'Blocked by .claude/hooks/guard-main.mjs: pushing to main deploys vivawellnessco.com. ' +
      'AGENTS.md: only Michael promotes to main. Push a feature branch or feat/lights-on instead.',
  );
}

// 1b) Branch-sweeping pushes reach main without naming it.
if (new RegExp(String.raw`\bpush\b` + SEG + String.raw`--(all|mirror|branches)\b`).test(cmd)) {
  deny(
    'Blocked by .claude/hooks/guard-main.mjs: git push --all/--mirror/--branches would push the local ' +
      'main branch to origin. Push the specific branch you mean instead.',
  );
}

// 1c) Putting main into any working tree (also closes the compound-command
//     path "checkout main && merge && push HEAD" that check 2 cannot see,
//     since it reads branch state before the command runs). Agents never
//     need main checked out in this repo.
if (new RegExp(String.raw`\b(checkout|switch|worktree\s+add)\b` + SEG + MAIN_REF).test(cmd)) {
  deny(
    'Blocked by .claude/hooks/guard-main.mjs: checking out main is off-limits for agents in this repo ' +
      '(main auto-deploys the live site; work branches off feat/lights-on). Read main with git log/diff/show instead.',
  );
}

// 2) History-changing commands while main is checked out.
if (/\b(commit|merge|rebase|cherry-pick|revert|push)\b/.test(cmd)) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const branch = execSync('git symbolic-ref --short HEAD', {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (branch === 'main') {
      deny(
        'Blocked by .claude/hooks/guard-main.mjs: main is checked out and main auto-deploys the live site. ' +
          'AGENTS.md: never commit, merge, rebase, or push on main. Switch to a work branch off feat/lights-on first.',
      );
    }
  } catch {
    // If git state cannot be read, do not block.
  }
}

// 3) Wrangler Pages deploys (bypass git entirely). The live site ships only
//    via Michael merging to main. The one deploy assistants may run is the
//    staging project, and it must be named explicitly: a deploy with no
//    --project-name (config default, interactive prompt) or with any other
//    project name is denied, so renames and defaults cannot slip through.
if (/\bwrangler\b/.test(cmd) && /\bpages\s+(deploy|publish)\b/.test(cmd)) {
  const named = cmd.match(/--project-name[=\s]+["']?([\w.-]+)/);
  if (!named || named[1] !== 'viva-feedback') {
    deny(
      'Blocked by .claude/hooks/guard-main.mjs: wrangler pages deploy is allowed only with an explicit ' +
        '--project-name viva-feedback (staging). Live deploys happen only through Michael merging to main.',
    );
  }
}

process.exit(0);
