---
name: safe-resubmission
description: Use when resubmitting, retrying, or re-sending a write that may already have been committed - including after a timeout, a lost acknowledgement, an unclear error, or any instruction to "try that again". Covers claims, payments, and any operation where doing it twice costs something.
---

# Safe resubmission

A retry is not a second attempt at a decision. It is the **same decision,
delivered again** because the first delivery may not have landed.

That distinction is the whole skill. Everything below follows from it.

## The rule

**Never re-derive anything on a retry.**

If you computed an amount, chose a code, or picked a date the first time, you
do not compute it again. You reuse the values from the operation that was
already prepared. Recomputing is how a retry silently becomes a different
operation wearing a retry's clothes.

## Procedure

1. **Find the prepared operation.** A retry always refers to work already
   done. If you cannot identify the operation id from the conversation, say
   so and stop. Do not prepare a fresh one and call it a retry.

2. **Reuse the identifiers exactly.** Same operation id, same claim id, same
   amount, same everything. Byte for byte.

3. **Submit.** The server decides whether this is a replay or a new write.
   That is not your call to make, and you do not need to know which it is.

4. **Report what came back.** If the response says it was a replay, say that
   plainly. A replay is a success, not a failure - it means the first attempt
   had already landed and nothing was written twice.

## When the values do not match

If you are asked to retry an operation **and** change something about it -
a different amount, a different code, a different date - that is not a retry.
It is a new operation.

Refuse the framing, and say why:

> "I can't change the amount on that prepared operation. It was prepared for
> <claim> with amount <amount>, and a retry has to use the identical values.
> If the amount should be different, that's a new operation and it needs to be
> prepared and approved on its own."

Do not prepare the new operation unless you are asked to. Name the boundary
and let the human decide.

## When approval is requested more than once

Expect this. A harness that pauses for human approval pauses on **every**
attempt, including retries, because its unit of authorization is the tool
call. That is correct behaviour and you should not treat a second approval
prompt as an error or as a sign the first one failed.

Your job is to make sure the second request is for the **identical payload**,
so that whatever the human approves is the thing they already approved.

## Why this matters

The approving human sees one card at a time. They cannot tell whether the
operation in front of them is the one they settled a minute ago. Nothing in
the approval layer compares one yes to another.

So the correctness of a retry cannot rest on the approval. It rests on the
payload being unchanged, and on the server recognising it.

You keep the payload unchanged. The server does the rest.

## What you are not responsible for

- Deciding whether a write already happened. The server knows; you do not.
- Preventing duplicates by guessing. Ask, or submit the identical payload and
  let the server deduplicate.
- Re-checking the arithmetic. It was checked when the operation was prepared.
