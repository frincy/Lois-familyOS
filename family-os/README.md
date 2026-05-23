# family-os skill plugin

This folder is the **skill plugin** that defines the Chief of Staff's behavior — how it talks, what files it reads, when it pushes back, how it captures decisions, how it maintains family models.

It's intentionally separated from the app and from your data:

| Folder | What lives here | Owns it |
|---|---|---|
| `family-os/` | The skill — instructions, prompts, behavior rules | upgradeable, shareable |
| `app/` | The runtime — web server, UI, MCP tools, Graph integration | upgradeable |
| `data/` | Your data — open loops, people files, daybook, decisions | yours forever |

You can edit `SKILL.md` directly to change how the COS behaves. It's read fresh on every chat turn — no restart needed.

## What the skill does

- Routes every chat turn through the **Chief of Staff Orchestrator** persona (see `skills/family-os/SKILL.md`)
- Defines the four modes: **Quick** (default, terse), **Working**, **Deep**, **Silent**
- Specifies how to maintain the three memory layers:
  - **Episodic** — daybook, interactions, chronicle
  - **Semantic** — family models, principal profile, north-star
  - **Procedural** — decision records, playbooks, learned preferences
- Owns the open-loop format, categorization rules, and ranking-ownership ("the order is theirs, never silently re-rank")
- Owns the per-member family model template (Cadence + Facts + Living model + Interactions)

## Extending the skill

Drop additional SKILL.md files under `skills/` for domain expertise (e.g. `skills/family-health/SKILL.md`, `skills/family-finance/SKILL.md`). The Chief of Staff orchestrator routes domain questions to them while still owning the chat interaction.
