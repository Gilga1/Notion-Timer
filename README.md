# Focus Timer — Notion Deep Work Tracker

A beautiful, minimal focus timer that syncs your work sessions directly into your Notion Second Brain.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express
- **Database**: SQLite (local session log via Drizzle ORM)
- **Notion**: `@notionhq/client` — reads your Projects & Tasks databases, writes time back

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration** → give it a name (e.g. "Focus Timer")
3. Copy the **Internal Integration Token** (`secret_xxx...`)

### 3. Share your databases with the integration

Open each of these in Notion, click **⋯ (More)** → **Add connections** → select your integration:

- Your **Projects** database
- Your **Tasks** database

> The app pulls database IDs for Projects and Tasks from the env files

### 4. Set your token

```bash
cp .env.example .env
# Edit .env and paste your token
# Edit add Project and Task env tokens
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000)

---

## How it works

| Feature           | What happens                                                                            |
| ----------------- | --------------------------------------------------------------------------------------- |
| Select Project    | Fetches live from Notion (filtered to active/in-progress)                               |
| Select Task       | Fetches tasks linked to that project                                                    |
| Start (Stopwatch) | Creates a local session entry, starts the clock                                         |
| Stop & Save       | Calculates duration, **adds minutes to Notion task's `Time Spent (mins)` field**        |
| Pomodoro          | 45m focus → 5m break → 45m focus → 10m long break. Each work block auto-saves to Notion |
| Dashboard         | Charts from local session log — bar chart, pie chart, top tasks, session log            |

## Project structure

```
focus-timer/
├── client/src/
│   ├── pages/
│   │   ├── timer.tsx        ← Main timer page (stopwatch + pomodoro)
│   │   ├── dashboard.tsx    ← Analytics dashboard
│   │   └── settings.tsx     ← Connection status + pomodoro config
│   ├── components/
│   │   └── Sidebar.tsx      ← Navigation sidebar
│   └── index.css            ← Design tokens + dark mode
├── server/
│   ├── routes.ts            ← API routes (Notion + sessions)
│   └── storage.ts           ← SQLite session storage
└── shared/
    └── schema.ts            ← Drizzle schema + Zod types
```
