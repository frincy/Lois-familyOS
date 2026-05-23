# Knowledge — outcomes, captured for next time

When a task completes, the COS writes the **outcome** (quotes, comparison, what you chose and why) to a topic record here. Next time something similar comes up, it surfaces this record up front so you start from your own past analysis instead of from scratch.

## Path convention

```
data/knowledge/<category>/<topic-slug>.md
```

Category is the loop's `#category` (`house`, `health`, `education`, `finance`, `goals`, `personal`). Slug is stable across instances of the same topic — e.g. `landscaping-service`, not `landscaping-may-2026`.

## Format

```
# Landscaping service · #house

## 2026-05 — Choosing a service
- GreenThumb — $120/visit, weekly, incl. cleanup
- YardPro — $90/visit, biweekly, no cleanup
Decision: GreenThumb — cleanup matters, weekly keeps it controlled.
```

Records grow over time — dated sections, not overwrites — so the history is preserved.

## Recall

Loop lines carry a `ref:<category>/<slug>` token after the `#category`. The board's notes drawer (the `+` on each item) opens the record directly.
