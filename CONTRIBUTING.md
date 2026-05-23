# Contributing to Family OS

Thanks for considering it. This is an early project with strong opinions — we'd rather have a small set of well-aligned contributors than a sprawl. Here's how to engage productively.

## Philosophy (read this first)

Three things we hold tightly:

1. **Local-first by default.** Your data is in plain markdown on your device. We don't add cloud sync, cloud storage, or telemetry by default — ever. If a feature *needs* a network call (e.g. the Outlook integration), it's explicit, scoped, and toggleable.
2. **Read + propose, you confirm.** The COS earns the right to act. Writes happen to files immediately because the file IS the receipt; but anything that touches the outside world (email send, calendar create) is staged or one-tap confirmed.
3. **No to-do app feature creep.** This is a Chief of Staff, not a productivity app. If a proposal looks like "add tagging / kanban / Pomodoro / streak", we will probably decline. If it looks like "make the COS remember what kind of vendor decisions you've made", we will probably love it.

## Good first contributions

- **Another principal pronoun set.** The default is "the user / they / them". If you want to ship Family OS with first-name + gendered pronouns, the `PRINCIPAL_NAME` env var is one half of it — extend to pronouns and we'll merge.
- **Cross-platform start scripts.** Right now `start-familyos.vbs` is Windows-only. macOS launchd plist and a Linux systemd unit would help.
- **A second integration.** Gmail via Google API, Apple Calendar via CalDAV, Linear / Notion for the principal who runs a startup. The pattern is in `app/server.mjs` — device-code OAuth, scoped, read+propose.
- **A "playbook" template.** SKILL.md says we distill ~3 same-tagged decisions into a playbook, but the playbook *format* isn't fully nailed down. Show us a great one.

## Less-good contributions (please don't)

- Themes, color pickers, "customization" of the canvas. The aesthetic is a feature.
- Sync to a cloud service.
- A "freemium" anything.
- Wrappers around other LLM providers without a clear reason. The Anthropic Agent SDK gives us the tool-use loop + permission gating + MCP — there's a real architectural cost to swapping it out.

## How to propose

1. Open an issue first for anything non-trivial. Describe the user / scenario, not the implementation. ("As a parent of two school-age kids, when X happens I want…")
2. We'll discuss whether it's in scope.
3. If yes, you send a PR. Keep it small. Tests aren't required but a 1-minute manual reproduction in the PR description is.

## Code style

- ESM, no build step in the app (vanilla JS in `app/public/`).
- Use the existing patterns: file-as-source-of-truth, scoped permission gates, fresh-read on every chat turn.
- Comments only where the *why* is non-obvious. The code reads top-down on purpose.

## Skill (SKILL.md) changes

Changes to the COS's *behavior* live in `family-os/skills/family-os/SKILL.md`. This is high-leverage code — a one-line change can change how every chat turn behaves. We're conservative here. Propose, then justify with at least one "hero scenario" (a specific user message + expected outcome).

## Code of conduct

Be excellent. We won't write a long policy — if you wouldn't say it at someone's dinner table you shouldn't say it on the issue tracker.
