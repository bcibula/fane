> Source of truth: github.com/bcibula/fane — any mounted or copied
> version is a stale snapshot. Fetch fresh per BOOTSTRAP.md.

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
   can paste into a new chat to continue the project, in this exact format:

   Use PROMPT 2 from PROMPTS.md to open this session, then load this context:

   Fane session — [DATE]

   Completed this session:
   - [what changed]

   Open items:
   - [full list]

   Where to start: [one line]

---


## Then Update Git
cd ~/fane && git add -A && git commit -m "session close" && git push



## PROMPT 2 — Start of session

**If today's date has not already been confirmed by Brad in this
session, ask now and wait.** Use only Brad's confirmed date for
SESSIONS.md entries and all session records. Never alter historical
dates already present in repository content.

If not already fetched this session per BOOTSTRAP.md, fetch all
project MD files via bash_tool curl — do not use web_fetch,
do not use the GitHub API:

  curl -s "https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/SESSIONS.md"
  curl -s "https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/PRINCIPLES.md"
  curl -s "https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/PROMPTS.md"
  curl -s "https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/YEAR1.md"
  curl -s "https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/READING.md"

These files are the source of truth for project state, principles, working
ritual, curriculum, and reading list. The mounted project files in Claude's
context may be stale — always fetch fresh from the repo.

Then: confirm your understanding of the current state of Fane — what has
been built, what is running, and what is next. Flag anything that seems
outdated or unclear before we proceed.

Raw base: https://raw.githubusercontent.com/bcibula/fane/refs/heads/main/


<append Prompt from 1 above>