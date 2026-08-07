# Fane Bootstrap

This file establishes a known-good Fane session state. Changes require
deliberate review and a SESSIONS.md entry.

## Canonical source

The canonical repository is the `main` branch of:

    github.com/bcibula/fane

## Required files

Retrieve the complete current contents of:

    BOOTSTRAP.md
    SESSIONS.md
    PRINCIPLES.md
    PROMPTS.md
    YEAR1.md
    READING.md

Use any available method that returns the complete file contents from
the canonical repository.

## Verification

Confirm that the BOOTSTRAP.md being executed is the freshly retrieved
canonical copy.

If execution began from another copy, compare it with the retrieved
copy, ignoring only line-ending differences. Stop if they differ.

Confirm that every required file was retrieved completely and is not an
error page, login page, rendered HTML, rate-limit response, or truncated
output.

## Failure

If retrieval or verification fails, report the exact failure and stop.

Do not substitute memory, chat context, mounted files, search results,
snippets, or cached copies.

## Completion

When bootstrap succeeds, report which files were loaded and return
control to the start-of-session prompt.
