# Writing Issues — Guide

How to write an issue for **Kat Planı Çizici** that someone (human or AI agent) can pick up and finish without guessing. The labels themselves are defined in [AGENTS.md §13](../AGENTS.md#13-github-issues); this file covers everything else.

Good examples to copy: [#42](https://github.com/MeWeGo/floorplanner/issues/42) (presets), [#38](https://github.com/MeWeGo/floorplanner/issues/38) (site-plan zoom), [#45](https://github.com/MeWeGo/floorplanner/issues/45) (render sky).

---

## 1. Before you write

1. **Search open *and* closed issues** (`gh issue list --state all --search "<words>"`). A closed issue may already cover it; reopen or reference it instead of filing a duplicate.
2. **Check the latest `main`, not your own checkout.** Several issues have been filed for features that had already shipped. `git fetch && git show origin/main:app.js | grep -n "<name>"` is enough.
3. **Find the real need.** Write down the user's problem in one sentence before thinking about the solution. If the problem applies to more than the one object you noticed, scope it that way (#42 started as "door presets" and became "presets for any configured object").

## 2. Title

```
[Feature Request]: <English, imperative or noun phrase> (<Türkçe karşılığı>)
[Bug]: <what is broken, where> (<Türkçe karşılığı>)
[Enhancement]: <improvement to something that exists> (<Türkçe karşılığı>)
```

Keep it under ~100 characters. Name the behaviour, not the implementation: *"Zoom out far enough for site plans"*, not *"Lower zoomAt clamp to 0.002"*.

## 3. Body — feature / enhancement

Use these headings in this order. Sections marked *optional* may be left out.

```markdown
## Summary / Özet
One English paragraph: what the user can do after this ships.

Bir Türkçe paragraf: aynı şeyin Türkçesi.

## Problem
- What is wrong or missing today, from the user's point of view.
- Concrete examples (sizes in cm, the steps the user repeats).

## Scope
1. **Short name.** One behaviour per item, described as what the user sees.
2. ...

### Quick win            (optional)
A smaller change that solves most of the pain and can ship first.

### Follow-ups           (optional)
Related work that should become its own issue later.

## Non-goals
- What this issue deliberately does not do, and where it belongs instead (#n).

## Acceptance criteria
- [ ] Checkable, behaviour-level statements. One per line.

## Test notes
- Which test in `tests/` to add or extend, and what to check by eye.
```

## 4. Body — bug

```markdown
## Summary / Özet
One sentence each in English and Turkish.

## Current behaviour
What happens. Attach a screenshot or the exported JSON if it helps.

## Steps to reproduce
1. Open <template / attached JSON>
2. ...

## Expected behaviour

## Environment
Browser + version, OS, theme (dark / light), language (tr / en), 2D or 3D, live site or `file://`.

## Acceptance criteria
- [ ] ...

## Test notes
- The regression test that would have caught it.
```

Bugs get a `severity:` label as well as a priority (see AGENTS.md §13).

## 5. Rules

### Describe behaviour, not code
- **No line numbers and no `file:///` links.** Line numbers go stale with the next commit and local paths point at someone else's machine.
- **No exact button labels, ASCII mockups, hex colour lists or code snippets.** These are implementation choices for whoever builds it. Describe the *control* ("a Save to library action on the properties panel"), not its text.
- You **may** name an existing function, field or file when it pins down *where* something lives (`P.lib`, `render3DHQ`, `mcp/server.js`) — check it exists on `main` first.

### One feature per issue
- If the scope has more than ~6 items, or contains parts that could ship independently, split it and link the parts with `#n`.
- Put "nice polish" (auto-colour, grouped dropdowns, extra presets) in Follow-ups, not Scope.

### Say how it fits the project
Every feature issue should account for the [Golden Rules](../AGENTS.md#2-golden-rules-read-first) where they apply:

| Concern | What to write |
| :-- | :-- |
| No dependencies / no build | Mention it if the obvious solution would need a library, CDN add-on or worker |
| Bilingual UI | "All new UI text is bilingual (TR / EN)" in the acceptance criteria |
| Theming | Must look right in dark, light **and** on white export paper |
| Data model | New fields need defaults in `loadProject()` so old saves still open |
| MCP mirror | If `P`, the catalogue or openings change, `mcp/server.js` must follow |
| Undo / autosave size | Large data (images, meshes) must not live inside `P` — every undo snapshot copies it |
| 3D | Does it rebuild in 3D? Is anything temporarily swapped restored afterwards? |

### Dependencies and overlaps
- Name other issues that touch the same code or data (`Coordinate with #40`), and say which one should land first if it matters.
- Do not assume features that do not exist yet (e.g. a command that calls an unimplemented tool).

## 6. Labels and creation

Exactly one **type** and one **priority** label; bugs also get one **severity** label. Do not invent labels — `gh label list` shows what exists.

```bash
gh issue create --title "[Feature Request]: ... (...)" \
  --label enhancement --label "priority: medium" \
  --body-file issue.md
```

## 7. Closing

- The PR body lists **one `Closes #n` per line** for every issue it finishes.
- After the merge, **check the issues actually closed** (`gh issue list --state open`). If one did not, close it by hand with a comment pointing at the PR.
- Closing without shipping: use `duplicate`, `invalid` or `wontfix` and say why in a comment.

## 8. Checklist

- [ ] Searched open and closed issues; not already on `main`
- [ ] Title in the `[Type]: English (Türkçe)` form
- [ ] Summary in English **and** Turkish
- [ ] Problem stated from the user's side
- [ ] Scope is behaviour-level; no line numbers, mockups or exact UI text
- [ ] Non-goals listed
- [ ] Acceptance criteria are checkable and include bilingual / theme / back-compat where relevant
- [ ] Test notes name the test to add or extend
- [ ] Related issues linked
- [ ] One type + one priority label (+ severity for bugs)
