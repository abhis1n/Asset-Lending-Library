# Architecture

Answer each of these, in your own words, once the system has taken real shape.

- What are the moving pieces, and how do they talk to each other?
- Where does each piece run?
- What is the request path for one representative user action, end to end?
- What did you decide *not* to build, and why?

---

## 1. What are the moving pieces, and how do they talk to each other?

The system is built as a decoupled web application with three main components: a single-page frontend, a RESTful backend API, and a relational PostgreSQL database.

The frontend is a React application built with Vite. It handles all user interactions, from browsing the catalogue and requesting loans to administrative librarian workflows like bulk CSV imports, loan returns, custodian assignments, and dashboard reporting. The frontend maintains client-side routing, user session state through an authentication context, and communicates with the backend via a centralized API service that wraps the browser fetch API. This service automatically attaches JWT bearer tokens into request headers, handles JSON serialization, manages file downloads for CSV exports, and triggers session resets when receiving 401 Unauthorized responses.

The backend is a Node.js service using Express. It is organized into modular routes, middleware, and controllers. Incoming HTTP requests pass through CORS configuration and body parsers for JSON and CSV text payloads. Authentication middleware validates incoming JWT tokens against the secret, confirms that the user record still exists in the database, and attaches the user identity and role to the request object. Specific routes apply role-checking middleware to ensure only librarians can perform staff actions like issuing loans, marking items lost, or managing catalogue items. Controllers handle the business rules, validate request inputs, coordinate database operations, and calculate dynamic states such as overdue status before returning clean JSON responses.

The data layer consists of PostgreSQL managed through Prisma ORM. Prisma provides schema definitions, database migrations, and a typed query interface for the backend controllers. When processing state changes that require atomicity or concurrency protection, such as requesting or issuing a loan, the backend uses Prisma transactions along with PostgreSQL row-level locks (SELECT FOR UPDATE) to prevent race conditions. PostgreSQL enforces fundamental data integrity through primary keys, unique constraints on user emails and item codes, foreign keys with restrict or cascade rules, and enum types for roles and loan statuses.

## 2. Where does each piece run?

In development, the entire stack runs locally on the developer machine. The React frontend runs on Vite's local development server at port 3000, which is configured to proxy API requests to the backend. The backend runs as a Node.js process managed by nodemon at port 5000, reading configuration from a local environment file. The PostgreSQL database can run locally inside a Docker container using the provided docker-compose configuration, or connect directly to a remote development database on Supabase.

In production, the application is split across cloud services that provide free-tier hosting:

The frontend is built into static HTML, CSS, and JavaScript assets and deployed to Vercel. Because it is a static single-page application, it runs directly in the user browser after being served from Vercel's global CDN. It directs its API traffic to the backend through an environment variable holding the backend URL.

The backend runs as a web service on Render. Render manages the Node.js runtime environment, handles HTTPS termination, and listens for API calls from the frontend. Because free-tier instances on Render sleep after periods of inactivity, the service can take around a minute to wake up on the first request, after which it responds normally.

The database is a managed PostgreSQL instance hosted on Supabase in the cloud. The backend connects to Supabase over TLS using Supabase's transaction pooler (PgBouncer) on port 5432. All secrets, including database connection strings, JWT signing keys, and service URLs, are configured as environment variables in the hosting dashboards and never committed to the code repository.

## 3. What is the request path for one representative user action, end to end?

A representative end-to-end request is a member requesting a loan for an available catalogue item.

1. Browser interaction: The logged-in member views an item in the catalogue and clicks the request button. This opens the loan request modal. Because the client knows the user has the member role, it displays member-appropriate fields: selecting the item, choosing a borrowing duration in days (defaulting to 14, allowed between 1 and 31), and entering an optional note explaining the request.

2. Frontend dispatch: When the member submits the form, the component validates the input locally to ensure the duration is a valid integer within the allowed range. The frontend API client retrieves the saved JWT token from browser local storage, adds it as an Authorization Bearer header, and sends an HTTP POST request with the JSON payload to the /api/loans/request endpoint.

3. Authentication and role verification: The Express server receives the request. The authentication middleware extracts the bearer token, verifies its signature against the server secret, and looks up the user in PostgreSQL. After confirming the user exists and is active, it attaches their user object and role to the request. The route does not restrict access to librarians because members are explicitly permitted to request loans.

4. Business logic and database transaction: The request reaches the loan controller. The controller validates that the item ID and duration values are integers within valid bounds. It then opens an atomic database transaction using Prisma:
   - First, it locks the member user row using PostgreSQL row-level locking (SELECT FOR UPDATE) to serialize concurrent requests from the same user.
   - It counts the member's existing open loans (those with status REQUESTED or ISSUED). If the member already has two active loans, the transaction aborts and returns an HTTP 409 Conflict error with a clear message explaining that the two-item borrowing limit has been reached.
   - Next, it locks the requested item row using SELECT FOR UPDATE to prevent race conditions where two members try to request the same asset simultaneously. It verifies the item exists and is not archived.
   - It checks whether the item already has an open loan in REQUESTED or ISSUED status. If another open loan is found, it aborts with an HTTP 409 Conflict error stating the item is currently unavailable.
   - Having satisfied all rules, the controller inserts a new loan record into the loans table with status REQUESTED, recording the request timestamp, duration, and a provisional due date.
   - In the same transaction, it inserts an immutable record into the loan histories table with type REQUESTED, linking the loan, the borrower's user ID, and their note.

5. Response and UI update: The database transaction commits atomically. The controller formats the newly created loan data and returns an HTTP 201 Created response containing the loan object. The browser receives the response, the modal closes, and the application updates the local loans list and catalogue status so the member immediately sees their new pending loan.

## 4. What did you decide not to build, and why?

Alongside the ten core requirements, I implemented two optional stretch ideas from the project brief: per-member borrowing limits (capping each member at a maximum of two active requested or issued loans, enforced atomically using database row-level locks) and item condition notes at check-out and check-in (captured as part of the immutable loan history timeline whenever items are requested, issued, or returned).

Beyond these two, I deliberately chose not to build the remaining stretch ideas and certain architectural additions to keep the system robust, maintainable, and focused on core reliability:

- Hold or reservation queues for items currently out: In a small equipment lending library, reservation queues add considerable complexity around queue timeouts, cancellation policies, borrower notifications, and out-of-order claims. Instead, items operate on a straightforward first-come, first-served model once they are returned and available.

- Barcode or QR-code scanning: Physical scanning requires camera API permissions, barcode generation, label printing, and specialized input handling. Full-text search over titles and codes, combined with real-time filtering and modal selectors, provided a faster and more dependable workflow without hardware dependencies.

- Email reminders before a loan's due date: Automated email delivery requires third-party SMTP services, bounce handling, and background scheduled jobs. On free-tier cloud hosting where services sleep when idle, background email schedulers are notoriously fragile. In-app overdue alert badges, navigation indicators, and dashboard tracking provide immediate visibility without external infrastructure.

- Most-borrowed items report: The dashboard already provides headline statistics, custodian breakdowns, status splits, and an eight-week return trend chart. A separate popularity ranking was unnecessary for day-to-day operations compared to keeping the core analytics responsive and accurate.

- Heavy frontend UI frameworks: I avoided heavyweight component libraries like Material UI or CSS utility frameworks like Tailwind. Custom vanilla CSS tailored to the application's layout kept the bundle lightweight, eliminated styling conflicts, and made the interface easier to maintain.

- Loan deletion and modification endpoints: To preserve an audit trail that cannot be rewritten, I intentionally did not build endpoints to edit or delete loans and their history. All loan events are strictly append-only, and database foreign key restrictions prevent deleting users or items that have historical loans attached.

