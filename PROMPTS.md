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

Before we begin: please fetch SESSIONS.md from the Fane repo using the
GitHub API and review it alongside your memory to confirm the current
state of Fane — what has been built, what is running, and what is next.
Flag anything that seems outdated or unclear before we proceed.

Fetch SESSIONS.md:
  GET https://api.github.com/repos/bcibula/fane/contents/SESSIONS.md
  Authorization: Bearer <GITHUB_TOKEN from ~/fane/.env>

Repo base (for fetching other files):
  https://api.github.com/repos/bcibula/fane/contents/
