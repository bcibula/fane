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

Every new Fane chat begins with this prompt.

If today's date has not already been confirmed by Brad in this session,
ask now and wait.

Use only Brad's confirmed date for new SESSIONS.md entries and session
records. Never alter historical dates already present in repository
content.

Retrieve the current BOOTSTRAP.md from the `main` branch of
github.com/bcibula/fane and execute it.

If bootstrap fails, stop.

After bootstrap succeeds, use only the files loaded and verified during
the current session.

Confirm your understanding of the current state of Fane:

- what has been built
- what is running
- what is next
- anything outdated, unclear, or inconsistent

Then incorporate the handoff context appended below. Treat the handoff
as supplemental context, not as authority when it conflicts with the
repository.

<append the previous session handoff here>