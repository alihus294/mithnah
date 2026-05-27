# Ali's Rules — Claude Code Setup

## CRITICAL: Auth Must Never Be Lost

### Step 0: Verify Auth Before EVERY Session

```bash
# Check if auth exists
if [ ! -f ~/.claude/.credentials.json ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ERROR: No auth found. Run setup first."
  exit 1
fi

# Verify auth works
"$CLAUDE_EXE" auth status --text | grep -q "Logged in" || {
  echo "ERROR: Auth expired or invalid. Re-run setup."
  exit 1
}
```

### Step 1: One-Time Setup (Choose ONE, Never Repeat)

**Option A: API Key (Best for automation — NEVER EXPIRES)**
```bash
# 1. Get key from https://console.anthropic.com/settings/keys
# 2. Save PERMANENTLY:
echo 'export ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY' >> ~/.bashrc
source ~/.bashrc
# 3. Verify:
"$CLAUDE_EXE" --bare -p "hello" --max-turns 1
```

**Option B: OAuth Token (Auto-refresh, copy once)**
```bash
# 1. Login in Windows Terminal first: claude auth login
# 2. Copy token to WSL PERMANENTLY:
mkdir -p ~/.claude
cp /mnt/c/Users/Ali/AppData/Roaming/Claude/.credentials.json ~/.claude/
chmod 600 ~/.claude/.credentials.json
# 3. Auto-sync on every shell start (add to ~/.bashrc):
echo 'cp /mnt/c/Users/Ali/AppData/Roaming/Claude/.credentials.json ~/.claude/ 2>/dev/null' >> ~/.bashrc
# 4. Verify:
"$CLAUDE_EXE" auth status --text
```

**Option C: Hermes Config (Centralized)**
```bash
hermes config set ANTHROPIC_API_KEY sk-ant-api03-...
# Hermes auto-injects on every session
```

### Step 2: Auto-Recovery Script (Add to ~/.bashrc)

```bash
# Claude Auth Auto-Recovery
check_claude_auth() {
  local exe=$(find /mnt/c/Users/Ali/AppData/Roaming/Claude/claude-code -name claude.exe 2>/dev/null | sort -V | tail -1)
  if [ -z "$exe" ]; then
    echo "Claude binary not found"
    return 1
  fi
  if ! "$exe" auth status --text 2>/dev/null | grep -q "Logged in"; then
    # Try to restore from backup
    if [ -f ~/.claude/.credentials.json ]; then
      cp ~/.claude/.credentials.json /mnt/c/Users/Ali/AppData/Roaming/Claude/
      echo "Auth restored from backup"
    else
      echo "Auth missing. Run: claude auth login"
      return 1
    fi
  fi
  echo "Auth OK"
}
# Run on every new shell
check_claude_auth
```

## Pre-Flight (Every session)

```bash
CLAUDE_EXE=$(find /mnt/c/Users/Ali/AppData/Roaming/Claude/claude-code -name claude.exe | sort -V | tail -1)
df -h / | grep '/$'  # >20% free
git status --short     # clean
"$CLAUDE_EXE" -p "hello" --max-turns 1 >/dev/null || exit 1
```

## Execution — Serial Only

### Print Mode (single task)

```bash
cat <<'EOF' | "$CLAUDE_EXE" -p --model opus --effort max \
  --max-turns 20 --max-budget-usd 5.00 \
  --allowedTools "Read,Edit,Write,Bash" \
  --permission-mode bypassPermissions 2>&1 | tee /tmp/claude.log
<role>Claude Code executor for Ali.</role>
<instructions>
1. Execute immediately. No questions.
2. Follow Ali's 13-step inspection protocol.
3. After EACH step: "### STEP X DONE: [evidence]"
4. Final: "### ALL STEPS COMPLETE"
</instructions>
<context>
Project: /mnt/c/Users/Ali/Coding projects/mithnah
Branch: $(git branch --show-current)
</context>
<task>[One file, <200 lines]</task>
EOF
```

### Tmux Mode (multi-turn)

```bash
S="claude-$(date +%s)"
tmux new-session -d -s "$S" -x 140 -y 40
tmux send-keys -t "$S" 'cd /mnt/c/Users/Ali/Coding\ projects/mithnah && '"$CLAUDE_EXE"' --model opus --effort max --dangerously-skip-permissions "[task]" 2>&1 | tee /tmp/'"$S"'.log' Enter
# Monitor: sleep 30; tmux capture-pane -t "$S" -p -S -20
```

## Hermes Verifies (after "### ALL STEPS COMPLETE")

```bash
git diff --stat; git status --short; tsc --noEmit; vitest --pool=forks
```

## Error Recovery

| Problem | Action |
|---------|--------|
| `error_max_turns` | resume same session_id |
| Fail twice | STOP, report Ali |
| Zero output | check `git diff --stat` |
| Auth lost | Run `check_claude_auth` from ~/.bashrc |

## Plugins (8 Required)

### Install Once

```
/plugin install typescript-lsp@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install pr-review-toolkit@claude-plugins-official
/plugin install hookify@claude-plugins-official
/plugin install claude-md-management@claude-plugins-official
/plugin install session-report@claude-plugins-official
/plugin install commit-commands@claude-plugins-official
```

### Plugin Usage Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  START: New task from Ali                                       │
│  Trigger: "سوي" or "كمل"                                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: commit-commands                                        │
│  Action: git status → stage changed files                       │
│  Output: Clean working tree, ready to work                      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: typescript-lsp                                         │
│  Action: Type check + IntelliSense on target file               │
│  Output: Type errors identified before edit                     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Execute task (Print Mode or Tmux Mode)                 │
│  Rules: One file, <200 lines, serial only                       │
│  Output: Code changes applied                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: security-guidance (AUTO — runs on file edit)           │
│  Action: Scan for XSS, injection, unsafe patterns               │
│  If RLS-related file: Manual RLS checklist (see below)          │
│  Output: Security warnings or "PASS"                            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: code-review                                            │
│  Action: Review changed code locally                            │
│  Focus: Logic, types, tests, architecture                       │
│  Output: Review comments or "LGTM"                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Hermes Verification                                    │
│  Action: git diff --stat; tsc --noEmit; vitest --pool=forks     │
│  Output: Build + tests pass/fail                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: commit-commands                                        │
│  Action: Generate commit message → commit                       │
│  Format: Conventional Commits (feat:, fix:, security:)          │
│  Output: Clean commit on current branch                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 8: session-report                                         │
│  Action: Generate session summary                               │
│  Output: Files changed, decisions made, issues unresolved       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 9: claude-md-management                                   │
│  Action: Update CLAUDE.md with new learnings                    │
│  Condition: Only if new pattern/rule discovered                 │
│  Output: CLAUDE.md updated (pending Ali approval)               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 10: Report to Hermes                                      │
│  Format: "### ALL STEPS COMPLETE — [branch] [commit] [status]"  │
│  Hermes: Verify, then report to Ali                             │
└─────────────────────────────────────────────────────────────────┘

                    [PR Workflow — when Ali says "ارمي"]
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 11: pr-review-toolkit                                     │
│  Trigger: Before creating PR                                    │
│  Action: Full PR review — comments, tests, error handling       │
│  Output: PR readiness report                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 12: hookify                                               │
│  Trigger: On "git push" or "deploy" command                     │
│  Action: BLOCK unless Ali explicitly approved                   │
│  Message: "Did Ali say 'ارمي'? Stop if no."                     │
│  Output: Blocked or Allowed                                     │
└─────────────────────────────────────────────────────────────────┘
```

### RLS Checklist (Manual — security-guidance does NOT catch all)

When editing ANY migration/policy file:

```markdown
- [ ] ALTER TABLE ... ENABLE ROW LEVEL SECURITY
- [ ] Policy has USING (not true)
- [ ] Policy has WITH CHECK for insert/update
- [ ] auth.uid() used correctly
- [ ] Tenant/org isolation present
- [ ] No service-role in frontend code
- [ ] SECURITY DEFINER functions reviewed manually
- [ ] Tests pass for anon/authenticated/service roles
```

### Hook Rules (hookify)

```markdown
# .claude/hooks/no-deploy-without-approval.md
Block: deploy, push, merge, git push
Unless: Ali said "ارمي" in this session
Action: STOP + ask for approval

# .claude/hooks/no-rls-without-checklist.md
Block: Edit files matching */migrations/*, *.policy.sql
Unless: RLS checklist acknowledged
Action: WARN + show checklist

# .claude/hooks/no-service-role-in-frontend.md
Block: Edit files matching */frontend/**/* + contain "service_role"
Action: BLOCK + error message
```

## Hard Rules

- Hermes coordinates ONLY. Claude executes ONLY.
- "سوي" = execute. "كمل" = continue.
- No merge/deploy without Ali's "ارمي".
- One file, <200 lines. Serial only.
- Windows claude.exe only.
- **Auth check on EVERY session start. Never assume it's there.**
