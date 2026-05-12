# Agent Harness Rules

These rules apply to every task executed through `.agent/run_once.sh`.

## Safety Constraints

- Do not read passwords, API keys, tokens, credentials, or private environment files such as `.desktop.env`, `.env`, keychains, SSH keys, or shell history.
- Do not delete files or directories.
- Do not modify system environment variables, shell profiles, global package manager config, or files outside this repository.
- Do not run `git push`, `git reset --hard`, `git checkout --`, `git clean`, or destructive git operations.
- Do not commit automatically. Leave changes in the working tree for human review.
- Ask the user before any sensitive operation, including dependency installation, network access beyond normal project verification, changing permissions, killing processes, opening GUI apps, or modifying generated/runtime artifacts.
- Preserve existing user changes. If unrelated dirty files exist, do not revert or overwrite them.

## Development Rules

- Work on one backlog task per run.
- Prefer minimal, testable changes.
- Add or update tests when behavior changes.
- Run `.agent/verify.sh` before reporting success.
- If verification fails, use the failure log as context and retry at most two times.
- On success, report a concise change summary, verification result, and recommended next step.
