Create a git commit for all staged and unstaged changes:
1. Run git status and git diff --stat
2. Draft a concise commit message following this repo's style (imperative, 1-2 sentences)
3. Stage the relevant files (not .env or credentials)
4. Commit with the message, always ending with:
   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
5. Show git status after commit
6. **Auto-capture** — After a successful commit, capture key learnings:
   - Use `search_memories` to check for duplicates first (search the commit message subject)
   - If the commit is non-trivial (not just typo/formatting), store 1-3 memories:
     - An **event** memory for the commit itself (what was done, why)
     - A **decision** memory if any architectural choice was made
     - A **pattern** memory if a reusable approach was used
   - Tag all with the relevant project name + "commit"
   - Skip auto-capture entirely for trivial commits (typo fixes, formatting, dependency bumps)
Do NOT push unless explicitly asked.
