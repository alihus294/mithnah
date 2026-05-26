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

## Hard Rules

- Hermes coordinates ONLY. Claude executes ONLY.
- "سوي" = execute. "كمل" = continue.
- No merge/deploy without Ali's "ارمي".
- One file, <200 lines. Serial only.
- Windows claude.exe only.
- **Auth check on EVERY session start. Never assume it's there.**
