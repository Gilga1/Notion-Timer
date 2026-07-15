/**
 * server/habitRoutes.ts
 *
 * Endpoints:
 *   GET  /api/habits/today          — today's Notion page with all checkbox states
 *   PATCH /api/habits/today/:habit  — check/uncheck a single habit on today's page
 *   GET  /api/nfc/:habitSlug        — NFC tag target: checks the habit, returns a lightweight HTML confirmation
 *
 * NFC tag setup:
 *   Write the URL  http://<your-tailscale-or-local-ip>:5000/api/nfc/thyroid-med  to the tag.
 *   Slug mapping is defined in HABIT_SLUG_MAP below — add/remove as needed.
 *
 * Add to server/index.ts (or routes.ts):
 *   import { registerHabitRoutes } from "./habitRoutes";
 *   registerHabitRoutes(app);
 */

import type { Express } from "express";
import { Client } from "@notionhq/client";
import { queryNotionCollection } from "./routes";

const HABITS_DB =
  process.env.HABITS_DS ?? "bd13c6c6-ca63-4ac6-8d55-75ac013b278b";

// Maps NFC-friendly URL slugs to exact Notion property names
const HABIT_SLUG_MAP: Record<string, string> = {
  "thyroid-med": "Thyroid Med",
  "spine-mobility": "Spine Mobility",
  "morning-meds": "Morning Meds",
  "eat-healthy": "Eat Healthy",
  skincare: "Skincare",
  topicals: "Topicals",
  upskill: "Upskill",
  reading: "Reading",
  coding: "Coding",
  gym: "Gym",
  "fat-burner-am": "Fat Burner AM",
  "fat-burner-pm": "Fat Burner PM",
  journal: "Journal",
  isabgol: "Isabgol",
  meds: "Meds",
};

// All checkbox habits returned in today's response — order matches the daily schedule
const ALL_HABITS = [
  "Thyroid Med",
  "Spine Mobility",
  "Morning Meds",
  "Eat Healthy",
  "Skincare",
  "Topicals",
  "Upskill",
  "Reading",
  "Coding",
  "Gym",
  "Fat Burner AM",
  "Journal",
  "Meds",
  "Fat Burner PM",
  "Isabgol",
];

function getNotion() {
  const token = process.env.NOTION_TOKEN;
  if (!token || token.length < 10)
    throw new Error("NOTION_TOKEN not set or invalid");
  return new Client({ auth: token });
}

function getTodayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function findOrCreateTodayPage(notion: Client): Promise<string> {
  const today = getTodayIST();

  // Try to find existing page for today
  const resp = await queryNotionCollection(notion, HABITS_DB, {
    filter: { property: "Date", date: { equals: today } },
    page_size: 1,
  });

  if (resp.results.length > 0) {
    return resp.results[0].id as string;
  }

  // Create today's page if it doesn't exist
  const created = await (notion as any).pages.create({
    parent: { database_id: HABITS_DB },
    properties: {
      Name: { title: [{ text: { content: today } }] },
      Date: { date: { start: today } },
    },
  });

  return created.id as string;
}

function extractHabits(page: any): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const habit of ALL_HABITS) {
    const prop = page.properties?.[habit];
    result[habit] = prop?.type === "checkbox" ? prop.checkbox === true : false;
  }
  return result;
}

function extractMacros(page: any) {
  return {
    calories: page.properties?.["Calories"]?.number ?? null,
    proteinG: page.properties?.["Protein (g)"]?.number ?? null,
    calorieDelta: page.properties?.["Calorie Delta"]?.number ?? null,
  };
}

// ── NFC confirmation HTML ─────────────────────────────────────────────────────
// Returned when NFC tag is tapped — shows a fullscreen confirmation on the phone
// without needing the React app to be open.
function nfcConfirmationHtml(habitName: string, alreadyDone: boolean): string {
  const emoji = alreadyDone ? "✓" : "✓";
  const color = alreadyDone ? "#888" : "#4caf7d";
  const message = alreadyDone
    ? `${habitName} was already checked`
    : `${habitName} marked done`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${habitName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f0f;
      color: #f0ede8;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 16px;
    }
    .check {
      width: 80px; height: 80px;
      border-radius: 50%;
      background: ${color}22;
      border: 2px solid ${color};
      display: flex; align-items: center; justify-content: center;
      font-size: 36px;
      color: ${color};
      animation: pop 0.3s ease;
    }
    @keyframes pop {
      0% { transform: scale(0.5); opacity: 0; }
      70% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
    h1 { font-size: 18px; font-weight: 500; }
    p  { font-size: 14px; color: #888; }
    a  {
      margin-top: 8px;
      font-size: 13px;
      color: #5b9bd5;
      text-decoration: none;
      padding: 8px 20px;
      border: 1px solid #5b9bd522;
      border-radius: 20px;
    }
  </style>
</head>
<body>
  <div class="check">${emoji}</div>
  <h1>${message}</h1>
  <p>${getTodayIST()}</p>
  <a href="${process.env.BASE_URL ?? ""}/">Open app</a>
  <script>
    // Auto-close after 3s if opened in a browser tab
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`;
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerHabitRoutes(app: Express) {
  // GET /api/habits/today — full today snapshot
  app.get("/api/habits/today", async (_req, res) => {
    try {
      const notion = getNotion();
      const pageId = await findOrCreateTodayPage(notion);
      const page = await (notion as any).pages.retrieve({ page_id: pageId });

      res.json({
        pageId,
        date: getTodayIST(),
        habits: extractHabits(page),
        macros: extractMacros(page),
      });
    } catch (e: any) {
      console.error("habits/today error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/habits/today/:habit — toggle a single habit checkbox
  // Body: { checked: boolean }  (omit to default to true)
  app.patch("/api/habits/today/:habit", async (req, res) => {
    try {
      const notion = getNotion();
      const habitName = decodeURIComponent(req.params.habit);

      if (!ALL_HABITS.includes(habitName)) {
        return res.status(400).json({ error: `Unknown habit: ${habitName}` });
      }

      const checked = req.body?.checked !== false; // default true
      const pageId = await findOrCreateTodayPage(notion);

      await (notion as any).pages.update({
        page_id: pageId,
        properties: {
          [habitName]: { checkbox: checked },
        },
      });

      res.json({ ok: true, habit: habitName, checked, pageId });
    } catch (e: any) {
      console.error("habits/today patch error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/nfc/:habitSlug — NFC tag target
  // Checks the habit and returns a standalone HTML confirmation page.
  // No auth needed — only accessible on your local/Tailscale network.
  app.get("/api/nfc/:habitSlug", async (req, res) => {
    const slug = req.params.habitSlug.toLowerCase();
    const habitName = HABIT_SLUG_MAP[slug];

    if (!habitName) {
      return res
        .status(404)
        .send(
          `<h2>Unknown habit slug: ${slug}</h2><p>Valid slugs: ${Object.keys(HABIT_SLUG_MAP).join(", ")}</p>`,
        );
    }

    let alreadyDone = false;

    try {
      const notion = getNotion();
      const pageId = await findOrCreateTodayPage(notion);

      // Check current state first
      const page = await (notion as any).pages.retrieve({ page_id: pageId });
      alreadyDone = page.properties?.[habitName]?.checkbox === true;

      // Always set to true (idempotent — tapping twice is fine)
      if (!alreadyDone) {
        await (notion as any).pages.update({
          page_id: pageId,
          properties: { [habitName]: { checkbox: true } },
        });
      }
    } catch (e: any) {
      console.error("nfc error:", e.message);
      // Still return a page — don't leave the phone hanging
      return res
        .status(200)
        .send(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#0f0f0f;color:#f0ede8"><h2>⚠ Sync failed</h2><p>${e.message}</p></body></html>`,
        );
    }

    res.setHeader("Content-Type", "text/html");
    res.send(nfcConfirmationHtml(habitName, alreadyDone));
  });

  // GET /api/habits/nfc-urls — returns all NFC tag URLs for the settings/QR screen
  app.get("/api/habits/nfc-urls", (_req, res) => {
    const base =
      process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
    const urls = Object.entries(HABIT_SLUG_MAP).map(([slug, name]) => ({
      slug,
      name,
      url: `${base}/api/nfc/${slug}`,
    }));
    res.json(urls);
  });
}
