# Plan

Answer each of these, in your own words.

- How did you break the work into sessions?
- What order did you build in, and why that order?
- What did you estimate versus what it actually took?
- What did you cut when you ran short?

---

## 1. How did you break the work into sessions?

I broke the project into small, functional sessions instead of trying to build everything at once. I started with the basic application structure and database, then moved through authentication, catalogue and loan functionality, librarian workflows, dashboard features, testing, and finally deployment and cleanup.

As the project became more complete, the sessions became more focused on fixing edge cases and matching the requirements. For example, I separately worked through loan due-date rules, borrowing limits, catalogue availability, user-facing API errors, and the dashboard's missing eight-week return chart.

This approach made it easier to test each part before moving on and made it easier to identify which changes were causing problems.

## 2. What order did you build in, and why that order?

I built the core data and application flow first because almost everything else depended on it.

The general order was:

1. Set up the backend, database schema, Prisma, and seed data.
2. Build authentication and the different user/librarian access paths.
3. Build the catalogue and item management functionality.
4. Build the loan workflow, including requests, issuing, returning, and lost items.
5. Refine the borrowing rules, including due dates, borrowing duration, availability, and the two-item limit.
6. Improve frontend error handling and user-facing feedback.
7. Build and complete the librarian dashboard.
8. Add and refine tests.
9. Prepare the application for deployment and deploy the backend, Supabase database, and frontend.
10. Do final fixes and documentation.

The main reason for this order was dependency. The loan system needed users and items, the dashboard needed loan data, and the frontend needed a working backend before deployment could be tested properly.

## 3. What did you estimate versus what it actually took?

I did not keep a precise hour-by-hour estimate throughout the project, but overall I worked for 12 to 14 hours on this project.

My initial expectation was that the main implementation would be relatively straightforward once the database and basic application structure were in place. In practice, the core CRUD functionality was not the part that took the most effort. More time went into integration issues, edge cases, validation, error handling, testing, and deployment.

Some examples were making the loan rules consistent across both frontend and backend, fixing cases where API errors such as 400, 404, or 409 reached the console but were not explained properly in the UI, making availability reflect the actual loan state, and getting the production database and frontend/backend configuration working together.

So the biggest difference between my estimate and reality was that the last-mile work took much longer than expected. The application could appear mostly finished while still having quite a few details that needed to be made reliable.

## 4. What did you cut when you ran short?

I prioritized the core requirements and kept the implementation focused rather than adding features that were not necessary.

The main things I cut or kept out were features that would have required a larger change to the existing data model or application architecture without being necessary for the core assignment. For example, I did not introduce a separate inventory-quantity system when individual items could already be represented by separate catalogue records.

I also avoided unnecessary infrastructure and configuration changes during deployment. Where the existing implementation was sufficient, I kept it rather than adding another layer just for the sake of completeness.

The remaining stretch work was handled based on how much value it added. The item condition notes functionality was already covered by the loan history workflow, while the eight-week return chart was added because it was a distinct dashboard requirement that was still missing.

Overall, when time was limited, I chose to finish and stabilize the required workflows rather than broaden the scope.