# Prompts

Standard prompts for Fane working sessions.

---

## PROMPT 1 — End of session

We are wrapping up this chat. Please do three things:

1. **Update project memory** — review what was discussed and accomplished
   in this chat and update your memory accordingly. Add new entries,
   replace outdated ones, and remove anything no longer accurate.

2. **Update SESSIONS.md** — generate a new entry for today in the lean
   format (what changed / open / next), to be prepended to the top of
   SESSIONS.md. Flag any insight-level additions for PRINCIPLES.md if
   something principle-worthy surfaced this session.

3. **Generate a next-chat prompt** — write a complete context prompt I
   can paste into a new chat to continue the project. Include: current
   infrastructure state, what was completed this session, all known open
   items, and exactly where to start next.

---

## PROMPT 2 — Start of session

**Before anything else: what is today's date?**
Do not use the date injected into your context — it is not verified and
cannot be trusted for session records. Wait for me to confirm the date.
Use only my confirmed date for SESSIONS.md entries and all session records.

Then fetch all project MD files via the GitHub API:

  GET https://api.github.com/repos/bcibula/fane/contents/SESSIONS.md
  GET https://api.github.com/repos/bcibula/fane/contents/PRINCIPLES.md
  GET https://api.github.com/repos/bcibula/fane/contents/PROMPTS.md
  GET https://api.github.com/repos/bcibula/fane/contents/YEAR1.md
  GET https://api.github.com/repos/bcibula/fane/contents/READING.md
  Authorization: Bearer <GITHUB_TOKEN from ~/fane/.env>

These files are the source of truth for project state, principles, working
ritual, curriculum, and reading list. The mounted project files in Claude's
context may be stale — always fetch fresh from the repo.

Then: confirm your understanding of the current state of Fane — what has
been built, what is running, and what is next. Flag anything that seems
outdated or unclear before we proceed.

Raw: https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/
