# Decisions — procedural memory

Every meaningful decision the COS helps you make gets written here as a Decision Record. Format:

```
# Decision · {title}
Date: YYYY-MM-DD · Tags: #category #subtopic
People: {names touched}
Loop: {linked open-loop title, if any}

## Situation
1-2 lines.

## Options considered
- A: …
- B: …

## Criteria (priority order)
1. …
2. …

## Choice + reasoning
{choice}. {why — the actual reasoning}.

## Outcome (filled later)
…

## Related
- knowledge/<cat>/<slug>.md
- playbook (when applicable)
```

The COS writes one of these when:

- You finish a **decide-with-me** session and commit
- You close a loop that involved a meaningful choice (it asks: "what was the decision behind this?")
- You state a decision in chat ("I'll go with X because…") — it extracts and records

## Why this matters

This is your *procedural* memory — *how* you decide, not just *what* happened. When a similar question comes up later, the COS recalls past decisions ("last time you weighed X you chose Y because Z — same factors here?"). Your reasoning patterns compound.

After ~3 decisions accrue under the same tag, the COS proposes distilling them into a **playbook** at `data/playbooks/<slug>.md` you can reuse explicitly.
