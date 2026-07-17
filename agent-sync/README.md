# Claude Code / Codex Sync Kit

This folder defines a lightweight coordination system for keeping Claude Code and Codex aligned.

Use it in any shared project by copying the `agent-sync` folder into the project root, or by keeping this folder as the canonical handoff location and linking to the active project.

## Core Rule

Before starting work, read:

1. `SESSION_STATE.md`
2. `DECISIONS.md`
3. `WORKLOG.md`
4. `HANDOFF.md`

After finishing work, update:

1. `WORKLOG.md`
2. `SESSION_STATE.md`
3. `DECISIONS.md`, if any decision changed or was added
4. `HANDOFF.md`, if another agent may continue the task

## Files

- `SESSION_STATE.md`: current shared truth: objective, owner, status, touched files, risks, next action.
- `WORKLOG.md`: chronological progress log from Claude Code and Codex.
- `DECISIONS.md`: durable decisions and rationale. This prevents repeated debate and hidden drift.
- `HANDOFF.md`: ready-to-use handoff note for the next agent/session.
- `CHECKLIST.md`: start/end checklist for each agent.
- `PROMPTS.md`: copyable prompts for Claude Code and Codex.

## Conflict Policy

If session notes disagree:

1. Treat `DECISIONS.md` as the highest-priority source for long-lived decisions.
2. Treat the latest timestamped `WORKLOG.md` entry as the highest-priority source for recent implementation status.
3. Treat `SESSION_STATE.md` as the live dashboard, but verify it against the log if stale.
4. If two agents made incompatible changes, pause implementation and write the conflict into `HANDOFF.md`.

## Recommended Workflow

1. Agent A starts by reading all sync files.
2. Agent A writes a short `WORKLOG.md` entry when work begins.
3. Agent A updates code/docs.
4. Agent A records changed files, tests run, and next steps.
5. Agent B begins by reading the same files, then continues from `HANDOFF.md`.

