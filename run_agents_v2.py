#!/usr/bin/env python3
"""Run 4 Claude Code sessions in parallel using fresh UUIDs."""
import subprocess
import os
import uuid
import time

PROJECT_DIR = "/mnt/c/Users/Ali/Coding projects/mithnah"
CLAUDE_EXE = "/mnt/c/Users/Ali/AppData/Roaming/Claude/claude-code/2.1.138/claude.exe"

agents = [
    ("AGENT_A_PLAN.md", "agent_a_v2.log"),
    ("AGENT_B_PLAN.md", "agent_b_v2.log"),
    ("AGENT_C_PLAN.md", "agent_c_v2.log"),
    ("AGENT_D_PLAN.md", "agent_d_v2.log"),
]

for plan_file, log_file in agents:
    session_id = str(uuid.uuid4())
    prompt = f"Read {plan_file} and execute ALL tasks. Apply fixes exactly as specified. Report progress."
    log_path = os.path.join(PROJECT_DIR, log_file)
    
    with open(log_path, "w") as f:
        f.write(f"=== Session {session_id}\n=== Starting...\n")
    
    # Use nohup to detach from terminal
    cmd = f"nohup '{CLAUDE_EXE}' --session-id {session_id} -p '{prompt}' >> '{log_path}' 2>&1 &"
    os.system(cmd)
    print(f"Started {plan_file} -> {log_file} (session: {session_id[:8]})")
    time.sleep(3)

print("\nAll started. Check logs in 60-120 seconds.")
