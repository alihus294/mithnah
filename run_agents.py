#!/usr/bin/env python3
import subprocess
import os
import time
import sys

PROJECT_DIR = "/mnt/c/Users/Ali/Coding projects/mithnah"
CLAUDE_EXE = "/mnt/c/Users/Ali/AppData/Roaming/Claude/claude-code/2.1.138/claude.exe"

agents = [
    ("a1111111-1111-1111-1111-111111111111", "AGENT_A_PLAN.md", "agent_a_out.log"),
    ("b2222222-2222-2222-2222-222222222222", "AGENT_B_PLAN.md", "agent_b_out.log"),
    ("c3333333-3333-3333-3333-333333333333", "AGENT_C_PLAN.md", "agent_c_out.log"),
    ("d4444444-4444-4444-4444-444444444444", "AGENT_D_PLAN.md", "agent_d_out.log"),
]

processes = []
for session_id, plan_file, log_file in agents:
    prompt = f"You are an agent. Read {plan_file} in this directory and execute ALL tasks listed there. Apply every fix exactly as specified. Report progress as you go."
    log_path = os.path.join(PROJECT_DIR, log_file)
    
    with open(log_path, "w") as f:
        f.write(f"=== Agent {session_id[:1].upper()} starting...\n")
    
    p = subprocess.Popen(
        [CLAUDE_EXE, "--session-id", session_id, "-p", prompt],
        cwd=PROJECT_DIR,
        stdout=open(log_path, "a"),
        stderr=subprocess.STDOUT,
        text=True,
    )
    processes.append((session_id, p, log_file))
    print(f"Started Agent {session_id[:1].upper()} (PID: {p.pid})")
    time.sleep(2)  # Small delay between starts

print("\nAll 4 agents started. Waiting for completion...")
print("Check logs in project directory.")

# Wait for all
for session_id, p, log_file in processes:
    p.wait()
    print(f"Agent {session_id[:1].upper()} finished (exit: {p.returncode})")

print("\nAll agents done!")
