# Decisions

Log the decisions that actually shaped this codebase — the ones where a real alternative existed and
you picked one. At least five entries. For each: what you chose, what you rejected, and why. At least
one entry must be a decision you later reversed — say what changed your mind. It can be any entry
below, not necessarily the last one; add a **Later reversed:** line to whichever one it is.

## Decision 1

- **Chose:** Requiring a borrowing duration between 1 and 31 days at loan request time, calculating an immediate provisional due date as requestedAt plus borrowDurationDays, allowing librarians to adjust it upon issue, and enforcing dueDate as a mandatory, non-nullable DateTime column in PostgreSQL.
- **Rejected:** Leaving dueDate nullable on requested loans until an item is issued by a librarian, or using a hardcoded static return window without borrower input.
- **Why:** When borrowers request equipment, they usually have an intended project timeframe in mind. Having a provisional due date gives members visibility into when their loan will be expected back, prevents indefinite placeholder requests from sitting in the system without an expected return horizon, and ensures consistent database querying, date sorting, and index usage across all loan rows.
- **Later reversed:** Early in the project, I strictly followed the literal phrasing of the specification that a loan carries a due date "once it is issued." I originally defined dueDate as nullable (DateTime?) in the Prisma schema and created requested loans with dueDate set to null. However, this caused problems across the stack: requested loans sorted ambiguously in the loan table, members had no way to indicate how long they needed the gear, and staff could not gauge return schedules. As the workflow matured, I introduced borrowDurationDays, computed a provisional due date at request time, added full UI controls for customizing due dates at checkout, and finally migrated the database schema to make dueDate non-nullable.

## Decision 2

- **Chose:** Using PostgreSQL row-level locks (SELECT FOR UPDATE) inside atomic database transactions (prisma.$transaction) to serialize concurrent requests for both catalogue items and borrower active loan counts.
- **Rejected:** Standard application-level "check-then-act" queries (findFirst followed by create) or optimistic concurrency using version counters.
- **Why:** In a lending library where every equipment item is unique and members have a hard limit of two active loans, standard read-then-write logic is vulnerable to race conditions under concurrent requests. If two members click "Request Loan" on the same camera simultaneously, or if a member submits two simultaneous requests across browser tabs, simple read queries would both see zero conflicting loans and proceed to insert duplicate active loans. Optimistic locking with retries would handle collisions after the fact but force users through confusing error-and-retry loops. Acquiring a pessimistic lock on the user row and the item row ensures that any overlapping requests are strictly queued and evaluated sequentially at the database engine level, guaranteeing that the two-item limit and single-borrower rule can never be breached.

## Decision 3

- **Chose:** Deriving overdue status dynamically in code whenever a loan is queried (status === ISSUED and dueDate < now) rather than storing an OVERDUE state in the database.
- **Rejected:** Adding an OVERDUE value to the LoanStatus database enum and running a recurring cron job or background worker process to update records when due dates pass.
- **Why:** Persisting an overdue state creates synchronization liabilities: loans become overdue in real life throughout the day, but a database flag only updates when a scheduled job runs, leading to stale data between runs. Furthermore, running persistent background cron workers requires specialized infrastructure that is difficult to sustain on free-tier hosting platforms where instances sleep when inactive. Computing overdue status dynamically guarantees real-time accuracy the moment any user or librarian opens the app, requires zero background server overhead, and aligns with the principle that overdue is a time-sensitive condition of an issued loan rather than a distinct lifecycle transition.

## Decision 4

- **Chose:** Enforcing onDelete: Restrict foreign key relationships between loans and loan_histories, as well as between users/items and loans.
- **Rejected:** Using onDelete: Cascade to automatically delete child records when a parent record is removed, or relying only on application-level routing to prevent deletions.
- **Why:** Requirement 9 ("History you cannot rewrite") establishes that every loan must maintain an immutable timeline showing when it was requested, issued, returned, or marked lost, and that nothing in this timeline can be edited or deleted after the fact. In the initial schema draft, loan_histories used onDelete: Cascade on the loan relation. I recognized that cascade behavior would allow a direct database deletion or future code change to wipe out the entire audit trail of a loan without warning. Changing the constraint to Restrict ensures the database engine itself rejects any deletion of loans that have recorded history, and prevents deleting members or equipment with active or historical loans, making the audit trail impossible to destroy even through raw database access.

## Decision 5

- **Chose:** Implementing full server-side filtering, text search across borrower emails and item titles, status filtering, and offset pagination (skip, take, and count) directly in the Express backend and Prisma queries.
- **Rejected:** Loading the full loan dataset into the browser and using React state to perform client-side filtering, sorting, and pagination.
- **Why:** Client-side filtering is quick to write for small prototypes, but it fundamentally fails the requirements and scales poorly. Requirement 6 specifically mandates that finding loans across the whole catalogue must happen on the server. Loading the entire database into browser memory wastes network bandwidth, degrades performance as checkout history accumulates, and introduces serious security and data-privacy issues by leaking other members' loan records to borrower browsers. Server-side queries ensure that the frontend only downloads the exact page of records requested, keeps query latency low, and allows the backend to strictly scope results according to user roles (members only receive their own loans, while staff receive catalogue-wide results).
