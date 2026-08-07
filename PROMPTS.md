> Source of truth: github.com/bcibula/fane — any mounted or copied
> version is a stale snapshot. Fetch fresh per BOOTSTRAP.md.

# Prompts

Standard prompts for Fane working sessions.

---

## PROMPT 1 — End of session

We are closing this Fane thinking session.

If Brad has not already confirmed the session date in this chat, ask now
and wait.

Use only Brad's confirmed date for the proposed `SESSIONS.md` entry and
the next-session handoff. Never alter historical dates already present
in repository content.

Use only the repository state loaded and verified during the current
session bootstrap, together with work actually discussed and completed
during this session. Do not use model memory, prior chat context,
mounted copies, or cached files as authority.

ChatGPT is the thinking and drafting layer. Claude Code is the
implementation layer. Do not edit the repository directly or claim that
repository changes, commits, pushes, service checks, or deployments were
performed.

### 1. Reconcile the session ledger

Review:

- the latest `SESSIONS.md` entry
- every previously open item
- the work actually completed during this session

Every previously open item must be:

- carried forward as open
- marked completed with supporting evidence
- deferred with a reason
- removed with a reason

Never allow an item to disappear through omission.

### 2. Draft the SESSIONS.md entry

Draft one new entry using Brad's confirmed date and this format:

    ## YYYY-MM-DD

    ### What changed
    - ...

    ### Open
    - ...

    ### Next
    - ...

The entry will be prepended above existing entries. Do not rewrite,
merge, correct, or otherwise alter historical entries, including an
earlier entry with the same date.

Do not propose creating additional Markdown files.

If something principle-worthy emerged, propose the addition separately
for Brad's review. Do not include an edit to `PRINCIPLES.md` without
Brad's explicit approval.

### 3. Produce the next-session handoff

Derive the handoff from the final proposed `SESSIONS.md` entry. Do not
compose it independently.

Use exactly this format:

    Fane session — [DATE]

    Completed this session:
    - [what changed]

    Open items:
    - [complete reconciled list]

    Where to start: [one specific next action]

The handoff is supplemental context to append to the canonical PROMPT 2.
It is not authority when it conflicts with the repository.

### 4. Produce the Claude Code implementation prompt

Produce a complete prompt Brad can paste into Claude Code.

The Claude Code prompt must instruct Claude Code to:

1. Execute PROMPT 2 and complete the canonical bootstrap if bootstrap has
   not already succeeded in that Claude Code session.
2. Apply only the exact repository changes approved by Brad.
3. Inspect the complete working tree and diff before staging.
4. Stage only the intended files.
5. Commit with a specific message describing the session.
6. Push to canonical `main`.
7. Fetch the remote state and verify:
   - the working tree is clean
   - local `HEAD` matches `origin/main`
   - the canonical files contain the intended changes
8. Report the exact failure and stop if any edit, commit, push, fetch, or
   verification step fails.

Do not instruct ChatGPT to perform implementation work.

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