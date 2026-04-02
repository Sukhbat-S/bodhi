---
name: review
description: Code review recent changes — runs in forked context to avoid polluting the main conversation.
disable-model-invocation: true
context: fork
agent: Explore
allowed-tools: Bash(git *)
---

# Code Review

Review recent code changes for bugs, security issues, and simplification opportunities.

## Context

Recent git changes:
!`git diff --stat HEAD~3`

Full diff:
!`git diff HEAD~3`

## Instructions

1. Read the diff carefully
2. Check for:
   - **Bugs**: Logic errors, off-by-one, null handling, race conditions
   - **Security**: Injection risks, exposed secrets, missing auth checks
   - **Simplification**: Unnecessary complexity, dead code, redundant logic
   - **Patterns**: Deviations from established project conventions
3. For each finding, provide:
   - File and line reference
   - What the issue is
   - Suggested fix (brief)

## Output Format

```
## Code Review Summary

**Files changed**: X files
**Commits reviewed**: last 3

### Issues Found

1. **[severity]** file.ts:line — description
   Fix: suggestion

### Good Patterns

- [things done well]

### Suggestions

- [non-critical improvements]
```

If no issues found, say so. Don't invent problems.
