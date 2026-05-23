# People — living family models

One file per household member, vendor, or important contact, named `<short-name>.md`.

The COS creates and maintains these automatically as you mention people in chat. You don't have to seed them — but if you want to, copy `_example.md` to (e.g.) `mom.md`, fill in the **Facts** block, and the COS will take over from there.

## What the COS does to each file

- **Updates `last-touch:`** every time you mention them
- **Appends to Interactions** with a one-line note about what happened
- **Maintains "Current themes"** — what's been going on in their life over the last ~2 weeks
- **Maintains "What they need from you"** — pending deliverables, drop-offs, replies that you owe them
- **Surfaces them in the morning brief** when they're overdue against their cadence target

## Cadence

The system flags someone as overdue when their `last-touch:` is older than the `target:` cadence:

| Cadence | Use for |
|---|---|
| `daily` | (rarely needed) |
| `weekly` | kids in the home, partner, anyone you want active visibility on |
| `biweekly` | close extended family, ongoing vendors |
| `monthly` | most extended family, regular service providers |
| `quarterly` | rare contacts you want to stay in touch with |

Specific cadences also work: `target: every 6 weeks`.
