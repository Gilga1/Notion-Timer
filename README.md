# Focus Timer — Notion Deep Work Tracker

A focus timer that syncs work sessions, habits, meals, and rewards with your Notion second brain.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express
- **Storage**: Local JSON files (sessions, meals, rewards, push subscriptions)
- **Notion**: `@notionhq/client` — Projects, Tasks, Habits, Meals
- **Optional**: OpenAI (meal photo + rewards), Web Push, Tavily

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create an integration and copy the **Internal Integration Token**
3. Share your Projects, Tasks, Habits, and Meals databases with the integration

### 3. Configure env

```bash
cp .env.example .env
# Fill NOTION_TOKEN, PROJECTS_DS, TASKS_DS, HABITS_DS, MEALS_DS
# Optional: OPENAI_API_KEY, APP_API_KEY, VAPID_*, BASE_URL, TAVILY_*
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000)

---

## Features

| Area | What it does |
|------|----------------|
| Timer | Stopwatch + Pomodoro; writes minutes to Notion task `Time Spent (mins)` |
| Today | Habit checkboxes, macros, deep work snapshot |
| Meals | Photo → GPT vision → log to Meals DB + Habit rollups |
| Dashboard | Local session charts (IST day buckets) |
| Rewards | Streak milestones → LLM reward suggestions |
| NFC | `/api/nfc/:slug` marks a habit done |

## Project structure

```
├── client/src/pages/     # timer, today, meals, dashboard, rewards, settings
├── server/               # Express API, Notion sync, scheduler, push
├── shared/schema.ts      # Zod schemas
└── *.db.json             # Local JSON stores (gitignored where appropriate)
```

## Docker

```bash
docker compose up -d --build
```

Persists JSON DBs under the `focus-timer-data` volume (`/app/data`).

## Auth

If `APP_API_KEY` is set, mutating API routes require `x-api-key`. Set matching `VITE_APP_API_KEY` for the client. NFC endpoints stay open for phone tags.
