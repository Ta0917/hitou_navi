# Copyable Prompts

## Startup Prompt For Claude Code Or Codex

Before making changes, synchronize with the shared agent state.

Read these files first:

1. `agent-sync/SESSION_STATE.md`
2. `agent-sync/DECISIONS.md`
3. `agent-sync/WORKLOG.md`
4. `agent-sync/HANDOFF.md`
5. `agent-sync/CHECKLIST.md`

Then continue from the latest handoff. If these files conflict, follow the priority order in `agent-sync/README.md`. Before editing, record what you are about to work on in `SESSION_STATE.md` and append a short start entry to `WORKLOG.md`.

## Shutdown Prompt For Claude Code Or Codex

Before ending this session, update the shared agent state.

Update:

1. `agent-sync/WORKLOG.md` with what changed, files touched, commands run, tests/checks, and remaining risks.
2. `agent-sync/SESSION_STATE.md` with current status, owner, touched files, and next action.
3. `agent-sync/DECISIONS.md` for durable decisions.
4. `agent-sync/HANDOFF.md` with a concise continuation note for the next agent.

Do not leave important decisions only in chat.

## Conflict Resolution Prompt

The sync files appear to disagree or conflict with the working tree.

Please:

1. Identify the exact disagreement.
2. Use `DECISIONS.md` for durable decisions.
3. Use the latest timestamped `WORKLOG.md` entry for implementation progress.
4. Check Git status/diff if available.
5. Write the resolution or unresolved conflict into `HANDOFF.md`.
6. Continue only after the current source of truth is clear.

