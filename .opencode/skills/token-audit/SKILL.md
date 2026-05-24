---
name: token-audit
description: Use when the user asks about token usage, context size, model cost, or wants to optimize model selection. Audits the current session for token consumption patterns and recommends cheaper models where appropriate.
---

# Token Audit Skill

Audit the current context for token efficiency.

## What to check

1. **Current model.** What model is being used for this session?
2. **Context size.** Roughly how many tokens are in the current conversation?
3. **File reads.** Were large files read unnecessarily? Could glob/grep have sufficed?
4. **Model selection.** Is the right model tier being used for the task? Flash vs Pro.

## Output

```markdown
## Token Audit

- Current model: [model name]
- Estimated tokens used: [count]
- Large file reads: [list files >500 lines read unnecessarily]
- Recommendation: [switch to Flash / keep Pro / use glob instead of Read]
```

## Rules

- If a task is simple (single file edit, basic question), recommend Flash.
- If a task involves architecture or multi-file changes, Pro is justified.
- Flag any file reads over 500 lines that could have been replaced with glob/grep.
