# Fane Bootstrap

Frozen file. It executes with instruction-level authority — changes
require deliberate review and a SESSIONS.md log entry.

After Brad confirms the session date, fetch all live project files:

    base=https://raw.githubusercontent.com/bcibula/fane/refs/heads/main
    for f in SESSIONS.md PRINCIPLES.md PROMPTS.md YEAR1.md READING.md; do
      curl -s "$base/$f" -o "/tmp/$f"
    done

Rules:
- bash_tool curl only. Never web_fetch (blocked for this repo). Never
  the GitHub API (rate-limited).
- After a recent push, raw.githubusercontent.com may serve cached
  content for 1-2 minutes. Wait and re-fetch rather than assuming
  the push failed.
- Verify each fetch returned content, not an error page.

On failure: report it and stop. Do not substitute memory, mounted
files, or cached content. Brad may explicitly authorize a named
alternative source; label all work based on it as provisional and
re-verify against the repo once fetch succeeds.

Then execute PROMPT 2 from the FETCHED PROMPTS.md — never a mounted
or remembered copy.
