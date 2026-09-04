# Submission

Fill this in and commit it. This is the first file we open.

## Links

- **GitHub repository:** https://github.com/abhis1n/Asset-Lending-Library
- **Live application:** https://asset-lending-library-ashen.vercel.app

## Notes for the reviewer

The backend web service is hosted on Render free tier, and the database is hosted on Supabase PostgreSQL. Render free-tier web services sleep after 15 minutes of inactivity. When opening the live application for the first time, please allow approximately 50 to 60 seconds for the backend instance to spin up. Subsequent page transitions, API calls, and queries will run at normal speed once the server is warm.

The database is pre-seeded with realistic equipment, users, custodians, and active loan scenarios to showcase all business rules immediately upon sign-in:

- Logging in as Alice (alice.member@example.com): Alice is a borrower with two active items: one issued camera (Sony Alpha A7 IV) and one requested drill (DeWalt Cordless Drill Kit). Because she has reached the per-member borrowing limit of two active items, attempting to request another item will trigger a clear 409 Conflict message explaining that the borrowing quota is reached. Her view is scoped strictly to her own loans, with librarian-only management controls hidden.

- Logging in as Bob (bob.member@example.com): Bob currently has an issued microphone (Shure SM7B) that is past its due date. When opening the loans view, this loan prominently displays a red Overdue badge. Because Bob only has one active loan, he still has one available borrowing slot and can request available catalogue assets.

- Logging in as Sarah (sarah.librarian@library.org): As a librarian, Sarah sees the full operational dashboard, including headline statistics, status breakdowns, custodian splits, and the 8-week weekly return trend chart. The navigation displays an alert badge for the 1 currently overdue loan (Bob's microphone), leading to the dedicated Overdue Alerts page where alerts can be reviewed and dismissed. In the catalogue, she can toggle My Custodial Items to see the 5 items she specifically oversees, or toggle archived items to reveal retired equipment like the 16mm Vintage Film Projector. In the loans view, she can issue Alice's pending drill request, record condition notes, process returns individually or via bulk selection, and export loan records to CSV.

- Catalogue availability: Equipment currently requested or issued (such as the Sony camera, DeWalt drill, and Shure microphone) displays an Unavailable badge and cannot be requested by other users, while returned and unborrowed equipment (such as the Canon EOS R5 and Aputure Light) displays an Available badge.

- Testing bulk CSV import: A sample catalogue_import.csv file is located in the root of the repository to test the librarian CSV import feature. The last 4 entries in this CSV file are intentionally invalid to demonstrate partial import and error reporting, throwing errors in the import summary due to a missing title, missing code, or an identifying code that is already in the database (CAM-SONY-001), while all valid rows import successfully.

- Local setup instructions: To run the application locally instead of using the live deployment:
  1. Start local PostgreSQL: In the project root, start the database container with docker compose up -d using docker-compose.yml.
  2. Configure backend environment: In the backend directory, copy .env.example to .env and fill in the values, matching the database credentials (for example POSTGRES_USER=asset_user, POSTGRES_PASSWORD=asset_password, POSTGRES_DB=asset_lending, POSTGRES_PORT=5432, DATABASE_URL=postgresql://asset_user:asset_password@localhost:5432/asset_lending?schema=public, JWT_SECRET=supersecret_jwt_key_asset_lending_2026, and PORT=5000).
  3. Initialize backend: Inside backend/, install dependencies with npm install, run database migrations with npm run prisma:migrate:deploy, seed initial data with npm run prisma:seed, and start the development server with npm run dev.
  4. Run frontend: Inside frontend/, install dependencies with npm install and start the dev server with npm run dev. The UI will run at http://localhost:3000 and automatically proxy API calls to the backend on port 5000.

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Librarian | sarah.librarian@library.org | Password123! |
| Librarian | david.librarian@library.org | Password123! |
| Member | alice.member@example.com | Password123! |
| Member | bob.member@example.com | Password123! |

## Stack

| Layer | What you used | Why |
|---|---|---|
| Frontend | React 18, Vite, Vanilla CSS | Fast development and build times with zero framework bloat. Plain CSS provides complete styling control over responsive tables, badges, modals, and charts without stylesheet conflicts or bulky runtime libraries. |
| Backend | Node.js, Express | Minimalist and dependable REST API layer with clean separation of routes, middleware, and controllers. Straightforward support for JWT authentication, role guards, and CSV parsing and generation. |
| Database | PostgreSQL, Prisma ORM | Relational integrity with foreign key constraints, composite primary keys, and enum types. Prisma provides type-safe database queries and migrations, while raw SQL row locking handles concurrency safely. |
| Hosting | Vercel, Render, Supabase | Free-tier hosting combination separating the static React single-page frontend on Vercel CDN, the containerized Node Express backend on Render, and managed PostgreSQL on Supabase with connection pooling. |

## Goal checklist

Mark each honestly. Partial is fine — say what is partial.

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Email and password login for Librarian and Member roles, enforced on the server via JWT authentication and role-checking middleware. |
| 2 | Catalogue items | Done | Full creation, editing, archiving, and restoring of catalogue assets with title, category, and unique identifying code. |
| 3 | Loans | Done | Each loan belongs to one item and tracks borrower, request date, and due date. Members can request items with custom duration, and staff can create loans directly. |
| 4 | A loan lifecycle with rules | Done | Valid transitions between Requested, Issued, Returned, and Lost. Overdue is calculated dynamically on view, and server rejects duplicate active loans on the same item. |
| 5 | Custodians | Done | Many-to-many relationship connecting librarians to items using a dedicated custodians join table. Librarians have a dedicated view for their assigned items. |
| 6 | Finding loans | Done | Catalogue-wide loan search across item titles and borrower emails, status and category filtering, date sorting, and server-side pagination with total match counts. |
| 7 | Acting on many items and loans at once | Done | Bulk CSV catalogue import with atomic row processing and per-row error reporting, bulk return of issued loans, and full CSV export of active loans. |
| 8 | A dashboard | Done | Landing page showing headline operational metrics, breakdowns by status and custodian, and an 8-week weekly return trend chart using database data. |
| 9 | History you cannot rewrite | Done | Immutable timeline recording every lifecycle event with actor ID, timestamp, and notes. Database Restrict foreign keys prevent deleting loan history. |
| 10 | Overdue loan alerts | Done | Alerts view for issued loans past due date, navigation badge with live count, and librarian dismissal that reappears if the item becomes overdue again later. |

Note: In addition to all 10 core goals, I also implemented two stretch goals: a per-member borrowing limit capping borrowers at 2 active items, and item condition notes recorded directly on checkout and check-in timeline events.

| # | Stretch Goal | Status | Notes |
|---|---|---|---|
| 1 | Per-member borrowing limits | Done | Capped members at a maximum of 2 active items (requested or issued combined), enforced at the database level with row locking and clear 409 conflict messages. |
| 2 | Item condition notes at check-out and check-in | Done | Captured librarian notes during loan issue and return as part of the immutable loan history timeline. |

## How much time did you actually spend?

I spent approximately 12 to 14 hours total on the project. The work was divided across focused sessions starting with backend architecture, Prisma database schema design, and authentication, followed by the loan lifecycle, frontend React foundation, catalogue and loan management UI, bulk operations, and dashboard analytics. The final stretch went into testing, edge-case validation, borrowing limit enforcement, and deployment setup.

## What would you do next, with another 12 hours?

If I had another 12 hours to build further, I would focus on:

1. A hold and reservation queue for items currently out on loan, allowing members to reserve equipment and be queued for the next available checkout when the item is returned.
2. Renewal requests that extend a due date, allowing borrowers to request a loan extension before the due date, with a librarian approval workflow to review and grant extensions.
3. Inventory quantity pools allowing multiple identical copies under a single catalogue entry for cables, adapters, and accessories that do not require individual serial tracking.
4. Mobile camera barcode and QR-code scanning to let librarians check equipment in and out instantly at physical shelves.
5. A report of the most-borrowed items and equipment utilization analytics to help librarians identify high-demand assets, assess wear and tear, and make informed purchasing decisions.

## What are you least happy with in this codebase, and why?

I am least happy with how pessimistic row locking had to be implemented for concurrency control during loan creation and request handling. Because Prisma does not offer a native API for SELECT FOR UPDATE, I had to drop into raw SQL queries within Prisma transactions to lock the borrower user row and catalogue item row. While this is effective and completely prevents race conditions against the two-item limit and item availability, mixing raw SQL queries with Prisma model queries feels slightly disjointed and reduces query layer uniformity.

I am also slightly unsatisfied with tracking alert dismissal state on the client side rather than in a dedicated database table. While this is simple and works well for an individual user session, storing dismissed alert states in PostgreSQL would ensure that multiple librarians sharing the dashboard always see a synchronized badge count across different devices.
