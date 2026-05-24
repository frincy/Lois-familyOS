# UX explorations — four directions for Lois

The current app ships a **freeform canvas** — draggable, resizable cards arranged any way you like. That's a deliberate v0.1 choice: maximum flexibility, minimum opinion, lets us learn what users actually use.

But the canvas isn't the only shape this product could take. A Chief of Staff has a different mental model than "a desktop full of cards" — and as we move toward a phone-first experience and onboarding strangers (not just the first user who built it), it's worth exploring what other shapes serve the COS mission.

This doc proposes **four UX directions**, each emphasizing a different aspect of the mission. They are mutually exclusive at their extremes; in practice we'd likely cherry-pick elements. The point of this doc is to make the trade-offs explicit before we commit.

**See [`docs/ux-mockups.html`](ux-mockups.html) — open in any browser for visual mockups of all four.**

---

## How to read this

For each direction I cover:

| | |
|---|---|
| **Thesis** | The one-line worldview |
| **Mission alignment** | Which part of the COS mission it amplifies |
| **Hero moment** | The user moment where this design *wins* |
| **Wireframe** | ASCII sketch of the primary surface |
| **What it gives up** | Honest trade-offs |
| **When to pick it** | The user / context where this is right |

Then at the end: a **recommendation matrix** for picking what to prototype.

---

## The four directions, in one paragraph each

| Direction | One-line | Phone-fit |
|---|---|---|
| **A · Briefing-First** | One card at a time. The COS leads. You acknowledge and advance. | Excellent |
| **B · Conversation-Centric** | The chat *is* the interface. Surfaces appear contextually. | Strong |
| **C · Day Strip** | A horizontal timeline of the day. Everything anchored to *when*. | Strong (vertical strip on phone) |
| **D · Family Graph** | A hub-and-spoke of the household. People are first-class. | Mixed |
| *(current)* **E · Freeform Canvas** | Drag, resize, rearrange. You shape your own view. | Weak |

---

## Direction A — Briefing-First

> **Thesis:** A real Chief of Staff doesn't make you choose what to look at. They brief you. One thing at a time. You react, the next thing surfaces.

### Mission alignment

The repo's pitch deck has this line: *"Mental load lives in one person's head — usually mom's."* The biggest cognitive cost in the current canvas is *deciding what to look at first*. Briefing-First eliminates that decision entirely — the COS picks.

This is the most direct expression of the **trust gradient**: the COS earns the right to act *by* leading well. You give it permission to set the agenda by tapping through; it learns what you accept and skip.

### Hero moment

7:14am. You're standing in the kitchen, coffee in one hand, phone in the other. The toaster pops. You glance at Lois. One card:

> **Lead the day**
>
> Anna's middle-school registration closes Friday. Worth bumping above the landscaping quote — it's the only hard deadline this week.
>
> **[Bump it up] · [Leave my order] · [Tell me more]**

Tap. Next card. *"Mom is overdue for a check-in (3 weeks since last touch). Quick call from the car after drop-off?"* Tap. Next. *"Decision pending — Sam's summer camp. Decide-with-me?"* Sit with it.

In 90 seconds you've made three decisions and the day is mapped. No app to navigate.

### Wireframe

```
┌─────────────────────────────────────┐
│  Lois               Fri · 7:14am   │
│                                     │
│   ╭─────────────────────────────╮  │
│   │  ◌ THE LEAD                  │  │
│   │                              │  │
│   │  Anna's middle-school        │  │
│   │  registration closes Friday. │  │
│   │  Worth bumping above the     │  │
│   │  landscaping quote — it's    │  │
│   │  the only hard deadline      │  │
│   │  this week.                  │  │
│   │                              │  │
│   │  [Bump it up]                │  │
│   │  [Leave my order]            │  │
│   │  [Tell me more]              │  │
│   ╰─────────────────────────────╯  │
│                                     │
│         ● ● ◐ ○ ○ ○ ○   (3 of 7)   │
│   ─────────────────────────────    │
│   ↓ peek: Mom is overdue for a...  │
└─────────────────────────────────────┘
```

When you tap **Tell me more** the card expands inline into a longer briefing — no navigation away.

### What it gives up

- **Backlog visibility.** "What else is on the list this week?" requires a separate mode (a swipe-up week sheet, say).
- **Cross-reference.** Holding two things in view at once is hard.
- **Scratch work.** No place to scribble or pin a note while you think.
- **Power-user density.** A founder who wants to scan 12 things at a glance is fighting the UI.

### When to pick it

- **Phone-first audience** — parents at school pickup, on a commute, at the kitchen counter
- **New users** — zero learning curve; the COS literally hands you what to do
- **The "5-minute check-in" use case** — opens, briefs, closes
- **When we want to demonstrate the COS is *smart*** — every card is a judgment call

This is the direction most aligned with the existing **PWA + push notifications** roadmap item.

---

## Direction B — Conversation-Centric

> **Thesis:** Talking to a Chief of Staff *is* the interface. The chat is the spine. Other surfaces are context that appears when relevant.

### Mission alignment

The COS mission is "a real Chief of Staff, not a chatbot." The current canvas treats chat as one card among many. This direction flips it: **chat is the primary surface**, and the COS *summons* context (a person's file, a calendar slice, the morning brief) into a side panel as the conversation calls for it.

This amplifies the **cognitive system** thesis — the COS *thinks* about what context matters, and only that context is on screen. No persistent dashboard of "stuff you might want." Everything is conversational and earned.

### Hero moment

You're thinking through your week. You open Lois, type:

> "I'm worried about Anna this week"

The chat responds. As it does, the right panel slides in: Anna's living model, her current themes, her last 5 interactions, and the open loops that touch her. You didn't ask for it; the COS knew you'd want it.

> COS: Anna's been quieter in your interactions log the last 10 days. The middle-school registration is her one hard deadline (Friday). Her last "needs from you" was "drop dress shoes Monday" — done? Want me to set a 30-min check-in on the calendar tonight after homework?

You say yes. The right panel morphs into a calendar slice showing tonight's open slots. You tap one. Done.

You move to the next thought — "what should I push back on this week?" — and the right panel morphs again, showing your north-star and the inbox proposals that conflict with it.

### Wireframe

```
┌──────────────────────────┬────────────────────────┐
│  ✶ Chat with COS         │  ▸ Context (auto)      │
│                          │                        │
│  > "I'm worried about    │  ◌ Anna · daughter     │
│     Anna this week"      │    · weekly cadence    │
│                          │    · last touch 2d     │
│  COS: Anna's been        │                        │
│  quieter in your         │  Current themes        │
│  interactions log the    │  · transition stress   │
│  last 10 days. The       │  · friend group shift  │
│  middle-school           │                        │
│  registration is her     │  What she needs        │
│  one hard deadline       │  · dress shoes Monday  │
│  (Friday). Her last      │  · check-in this week  │
│  "needs from you" was    │                        │
│  "drop dress shoes       │  Open items            │
│  Monday" — done? Want    │  · middle-school reg   │
│  me to set a 30-min      │  · dentist next month  │
│  check-in tonight after  │                        │
│  homework?               │  Recent interactions   │
│                          │  · 2d ago · school     │
│  [Yes, find a slot]      │  · 5d ago · groceries  │
│  [Tomorrow instead]      │  · 8d ago · talk after │
│                          │           dinner       │
│  ─── type a message ──── │                        │
│                          │                        │
└──────────────────────────┴────────────────────────┘
```

On phone: chat full-screen, right panel slides up as a peek sheet when the COS surfaces context.

### What it gives up

- **At-a-glance state.** "What's on for today?" requires asking, not glancing.
- **Idle scanning.** No dashboard of "things to consider." You drive the conversation.
- **Speed for known tasks.** Marking a loop done becomes "type 'done with X'" or tap an inline action — slower than dragging a checkbox in the canvas.
- **The persistent presence** of family/calendar/inbox cards is gone.

### When to pick it

- **Deep work moments** — "I need to think this through"
- **Decision-making sessions** — decide-with-me feels natural here
- **The "smart conversation" demo** — most powerful when showing investors what an LLM Chief of Staff *feels* like
- **When the answer is "ask the COS"** rather than "navigate to find it"

This is the direction that best showcases the **decide-with-me + procedural memory** moat.

---

## Direction C — Day Strip

> **Thesis:** A household runs on time. Everything has a *when*. Make time the primary axis.

### Mission alignment

The COS mission is rooted in *the cognitive load of running a household*. Households are inherently time-bound — school starts at 8, pickup at 3, dinner at 7, kids in bed by 9. The current canvas treats time as a property of items (a `due:` date, a calendar event); the Day Strip makes time the **organizing dimension**.

This direction amplifies the **anticipation** part of the mission — the morning brief, the conflict alerts, the "what's coming up before pickup" question. It also makes **ticklers / reminders** finally feel native (they belong on a timeline; they don't really belong on a "to-do list").

### Hero moment

It's 11:42am. You finished a meeting. You glance at Lois. The strip is centered on NOW:

> *to the left:* 9am pediatrician (Anna) ✓ · 10:30 grocery pickup ✓ · 11am-12 work block (you're here)
>
> *to the right:* 12:30 lunch with the team · 1:30 prep for pickup · 3pm school pickup · 3:30 Anna's snack & homework · 7pm dinner
>
> **Lois quietly inserts at 2:15:** *"Mom hasn't been called in 3 weeks. Call from car on the way to pickup?"*

That insertion is the COS's voice on the timeline. Tap it → "remind me at 2:45" or "do it now" or "tomorrow morning instead." The tickler lives on the timeline naturally.

### Wireframe

```
┌──────────────────────────────────────────────────────┐
│ today · Fri May 23      ✶ decisions:1   ◌ overdue:2 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  7a    8     9     10    11    NOW   1pm   2    3   │
│   │    │     │     │     │     │     │     │    │   │
│  ◯brief◯─────◯peds.◯focus─◯───◐──┐   │     │  ◯pick │
│   │    │     │ 9am  │     │     │   │     │   3pm   │
│   │    │     │ Anna │     │     │   │     │         │
│   │    │     │      │     │     │   │     │         │
│  done  done  done   done  active  ↓ │     │  up next│
│                                  ╔══════════════╗   │
│                                  ║ ✦ Lois inserts ║ │
│                                  ║                ║ │
│                                  ║ Mom hasn't been║ │
│                                  ║ called in 3wks.║ │
│                                  ║ Call from the  ║ │
│                                  ║ car at 2:45?   ║ │
│                                  ║ [yes] [do now] ║ │
│                                  ║ [tomorrow]     ║ │
│                                  ╚══════════════╝   │
│                                                      │
├──────────────────────────────────────────────────────┤
│ 💬 Quick chat with COS... [type]               [send]│
└──────────────────────────────────────────────────────┘
```

Drag the strip left to see what happened (with the COS's commentary on closes/skips). Drag right to plan ahead. End-of-day reflection is the rightmost card.

On phone: rotate to a vertical strip (top = morning, bottom = evening, "now" in middle); same interaction.

### What it gives up

- **Non-time items.** A house-tasks loop without a `due:` date doesn't have a natural home.
- **Weekly view.** Day-centric by design; week-view becomes a different surface or a swipe-up.
- **Family-graph visibility.** People are tags on events, not first-class entities.
- **Decision history / playbooks.** These are atemporal; they live elsewhere.

### When to pick it

- **The "during the day" check-in** — between meetings, after pickup, in transit
- **Calendar-heavy users** — when the day is mostly events
- **Phone-first** — the strip works beautifully on a vertical screen
- **When the question is "what's now / what's next"** — the answer is literally in front of you

---

## Direction D — Family Graph

> **Thesis:** The OS for a *household* should put the household — the people — at the center. Everything else orbits.

### Mission alignment

The single hardest-to-copy moat in the architecture is **per-member family models** with cadence + last-touch + living themes. The current canvas hides that in a "people" data folder you never see. The Family Graph makes it the centerpiece — every person is on screen, every overdue cadence is physically visible, every interaction enriches the visible state.

This is the direction that most aggressively makes the differentiator (the family graph) **visible**. Cozi can't render this view because it has no data model for it. Motion can't render this view because it doesn't track people as entities.

### Hero moment

You open Lois on a Sunday afternoon. Instead of "today" you see your household:

```
        ⊙ Mom            ⊙ Spouse
       (overdue 3d)      (current)
       ring pulsing     · travel planning
         softly         

                   ╔══════╗
                   ║ YOU  ║
                   ╚══════╝

        ⊙ Anna           ⊙ Sam
       (current)        (current)
       · school reg     · summer camp
       · dress shoes      decision pending
```

The visual itself does the work. You don't need the brief to tell you Mom is overdue — her ring is pulsing. You don't need a separate "decisions" tab — Sam's pending decision is right under his name. Tap Anna and her panel takes over: living model, recent interactions, open items, calendar slice.

You scan the graph in 5 seconds and you know your household's state.

### Wireframe

```
┌──────────────────────────────────────────────────────┐
│ today's brief — Anna's middle-school reg (Fri) ▼   │
├──────────────────────────────────────────────────────┤
│                                                      │
│       ┌─────────┐              ┌─────────┐          │
│       │ ◌ Mom   │              │ ◌ Spouse│          │
│       │ ⚠ 3d od │              │ current │          │
│       │ ─ call  │              │ ─ travel│          │
│       └────┬────┘              └────┬────┘          │
│            │                        │                │
│             ╲                      ╱                 │
│              ╲    ╔══════════╗    ╱                  │
│               ╲   ║          ║   ╱                   │
│                ╲  ║   YOU    ║  ╱                    │
│                 ╲ ║          ║ ╱                     │
│                  ╲╚══════════╝╱                      │
│                  ╱            ╲                      │
│                 ╱              ╲                     │
│            ┌───┴────┐      ┌───┴────┐               │
│            │ ◌ Anna │      │ ◌ Sam  │               │
│            │ current│      │ current│               │
│            │ ─ reg  │      │ ─ camp │               │
│            │ ─ shoes│      │   decision│            │
│            └────────┘      └────────┘               │
│                                                      │
│   loops & decisions not about a person ▼            │
│   💬 chat with COS ▼                                 │
└──────────────────────────────────────────────────────┘
```

Visual states:
- **Solid ring** — within cadence, no live needs
- **Dotted ring** — has live needs from you
- **Pulsing amber** — overdue against cadence
- **Pulsing red** — critically overdue (>2x cadence)

### What it gives up

- **Task-shaped flows.** Most household admin (renew passport, get the gutters cleaned) isn't person-specific. They live in a secondary panel.
- **Time-pressure visualization.** Hard deadlines don't stand out as much as overdue cadences.
- **Onboarding.** A new user with no family files sees an empty graph. Needs a great "add your first person" flow.
- **Vibe risk.** Could feel like "CRM for family" which is the wrong emotional register.

### When to pick it

- **Weekly check-in / Sunday planning** — "how is everyone doing?"
- **Relationship-heavy households** — multigenerational, blended, caregivers
- **Demo to investors who get the moat** — this visually IS the moat
- **When the product needs to feel like *Lois cares about your people*** — emotional differentiation

---

## Hybrid notes — what they share

Each direction is presented at its extreme. In practice the strongest product is likely a **hybrid that defaults to one mode and gives access to others on a switch**. Some examples:

- **A + B** — Briefing-First on opening, with a chat slide-up always available
- **A + C** — Briefing-First as the "now" mode, Day Strip as the "during the day" mode
- **B + D** — Conversation as the spine; Family Graph as the right-panel context for "I'm worried about X"
- **C + D** — Day Strip on top, Family Graph as the persistent "outside the timeline" bar

The current canvas (E) is essentially the **null hybrid** — none of the above, you assemble it yourself. That's defensible for v0.1 (let users discover what they want) and untenable at scale (most users won't customize).

---

## Recommendation matrix

| If our next bet is… | Pick |
|---|---|
| **PWA + phone push** for the morning routine | **A (Briefing-First)** — phone-native, COS-led, matches the "phone in one hand" moment |
| **Showcase the smart-conversation product** to early adopters / investors | **B (Conversation-Centric)** — most "wow" demo, decide-with-me feels natural |
| **Build for the during-the-day check-in** that today's canvas misses | **C (Day Strip)** — solves the "what's now / what's next" question other tools handle clumsily |
| **Lead with the moat** (per-member family models) | **D (Family Graph)** — makes the differentiator visible from second one |
| **Keep optionality, learn from users** | **E (current canvas)** — what we ship today |

### My read

If I had to pick one to prototype next: **A (Briefing-First) for phone**, **B (Conversation-Centric) as the default desktop experience**, and **keep the canvas (E) as a "power mode" toggle** for users who want it.

That gives us:
- A great phone story (A)
- A great "first impression" desktop story for new users (B — the chat-led experience feels like nothing else)
- The canvas as an explicit power-user mode (E) for the small number of users who'd actually use the drag-and-drop flexibility

D (Family Graph) is the most interesting visual but the riskiest emotionally. I'd hold it as a future "view mode" within B — when the COS detects you're in a person-thinking moment, the right panel becomes the Family Graph.

C (Day Strip) is the most interesting *concept* but probably belongs as a third view inside whatever frame we pick, not the primary frame.

---

## What I'd build first if we picked one

If we committed to **A (Briefing-First) for phone**:

**MVP scope (one week of work):**
1. New `/brief` route (or PWA shell) that renders one card at a time
2. The COS produces a *card stack* — an ordered JSON of `{title, body, actions}` from the existing brief + open loops + person overdues + decisions pending
3. Swipe / tap-action interactions — accept advances, dismiss advances, "tell me more" expands inline
4. Reuse the existing chat backend for "tell me more" expansion
5. Web-push for "Lois has briefed you" notification at 7am

This is mostly UI plumbing; the backend reasoning is already there (brief, loops, people, decisions). The work is making the *form* of the response card-stackable.

---

## See also

- **[`docs/ARCHITECTURE.md`](ARCHITECTURE.md)** — why these UX shapes are possible given the underlying cognitive architecture
- **[`docs/PRIVACY.md`](PRIVACY.md)** — what data crosses the wire on each surface (relevant when designing per-card actions)
- **[`family-os/skills/family-os/SKILL.md`](../family-os/skills/family-os/SKILL.md)** — the COS persona; any UX direction has to work with these mode + reply rules
- **[`docs/ux-mockups.html`](ux-mockups.html)** — visual mockups of all four directions
