# Playbooks — distilled procedural memory

When the COS has watched you make ~3 decisions under the same tag, it proposes distilling them into a playbook here. A playbook is your *meta-decision* — the criteria and patterns you actually use, in your own words.

It's not auto-created. The COS asks first ("I've watched you choose vendors a few times — should I distill this into a `playbooks/vendor-selection.md` you can reuse?"). You say yes, it drafts, you edit.

## Format (suggested, not enforced)

```
# Playbook · {title}
Distilled from: decisions/YYYY-MM-DD-X.md, decisions/YYYY-MM-DD-Y.md, decisions/YYYY-MM-DD-Z.md

## When to use
Situations where this applies.

## Criteria I weight
1. … (highest)
2. …
3. …

## Heuristics I've found work
- …
- …

## Anti-patterns
- …
```

The COS can read a playbook back to you during a `decide-with-me` session ("you have a playbook for vendor selection — should I run today's choice through it?").
