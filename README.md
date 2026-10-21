# Campus Gig & SkillSwap Portal

A beginner-friendly full-stack student marketplace built with React, Vite, Express, and a JSON file database.

## Requirements
- Node.js LTS (includes npm)
- VS Code (recommended)

## Run the project
1. Extract the ZIP file.
2. Open the extracted `Campus-Gig-SkillSwap-Portal` folder in VS Code.
3. Open Terminal > New Terminal.
4. Run:

   ```bash
   npm run install:all
   ```

5. When installation finishes, run:

   ```bash
   npm run dev
   ```

6. Open the website shown by Vite, usually `http://localhost:5173`.
7. The API runs at `http://localhost:4000/api`.

Keep the terminal open while using the application. Press `Ctrl + C` to stop both servers.

## What is included?
- Student profile selection (demo users)
- Browse and search gigs
- Category, type, payment and budget filters
- Create a gig
- Apply to another student's gig
- Gig owner can accept/reject applicants
- Status workflow: Open -> In Progress -> Completed
- Mutual reviews after completion
- Express mock API and seeded data

## Demo notes
This is a hackathon prototype, not a production service. It does not have authentication, real payments, or a hosted database. The profile selector simulates the current student. Data is stored in `server/db.json`; the server updates this file when you create or modify records.

## Useful API endpoints
- `GET /api/users`
- `GET /api/gigs`
- `POST /api/gigs`
- `GET /api/applications`
- `POST /api/applications`
- `PATCH /api/applications/:id`
- `PATCH /api/gigs/:id`
- `GET /api/reviews`
- `POST /api/reviews`
