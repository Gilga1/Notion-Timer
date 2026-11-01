/**
 * server/habitRoutes.ts
 *
 * Endpoints:
 *   GET  /api/habits/today          — today's Notion page with all checkbox states
 *   PATCH /api/habits/today/:habit  — check/uncheck a single habit on today's page
 *   GET  /api/nfc/:habitSlug        — NFC tag target: checks the habit, returns HTML confirmation
 */

import type { Express } from "express";
import {
  HABITS_DS,
  getNotion,
  getTodayIST,
  ensureAppKey,
  findOrCreateTodayHabitPage,
  extractHabitMacros,
  escapeHtml,
} from "./notionShared";

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

function extractHabits(page: any): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const habit of ALL_HABITS) {
    const prop = page.properties?.[habit];
    result[habit] = prop?.type === "checkbox" ? prop.checkbox === true : false;
  }
  return result;
}

function nfcConfirmationHtml(habitName: string, alreadyDone: boolean): string {
  const emoji = alreadyDone ? "○" : "✓";
  const color = alreadyDone ? "#888" : "#4caf7d";
  const message = alreadyDone
    ? `${habitName} was already checked`
    : `${habitName} marked done`;
  const safeName = escapeHtml(habitName);
  const safeMessage = escapeHtml(message);
  const safeDate = escapeHtml(getTodayIST());
  const base = escapeHtml(process.env.BASE_URL ?? "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeName}</title>
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
  <h1>${safeMessage}</h1>
  <p>${safeDate}</p>
  <a href="${base}/">Open app</a>
  <script>
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`;
}

export function registerHabitRoutes(app: Express) {
  app.get("/api/habits/today", async (_req, res) => {
    try {
      if (!HABITS_DS) {
        return res.status(500).json({ error: "HABITS_DS not set" });
      }
      const notion = getNotion();
      const pageId = await findOrCreateTodayHabitPage(notion, HABITS_DS);
      const page = await (notion as any).pages.retrieve({ page_id: pageId });

      res.json({
        pageId,
        date: getTodayIST(),
        habits: extractHabits(page),
        macros: extractHabitMacros(page),
      });
    } catch (e: any) {
      console.error("habits/today error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/habits/today/:habit", ensureAppKey, async (req, res) => {
    try {
      if (!HABITS_DS) {
        return res.status(500).json({ error: "HABITS_DS not set" });
      }
      const notion = getNotion();
      const habitParam = Array.isArray(req.params.habit)
        ? req.params.habit[0]
        : req.params.habit;
      const habitName = decodeURIComponent(String(habitParam ?? ""));

      if (!ALL_HABITS.includes(habitName)) {
        return res.status(400).json({ error: `Unknown habit: ${habitName}` });
      }

      const checked = req.body?.checked !== false;
      const pageId = await findOrCreateTodayHabitPage(notion, HABITS_DS);

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

  // NFC intentionally open — phone tags can't send API keys
  app.get("/api/nfc/:habitSlug", async (req, res) => {
    const slug = String(req.params.habitSlug ?? "").toLowerCase();
    const habitName = HABIT_SLUG_MAP[slug];

    if (!habitName) {
      const valid = escapeHtml(Object.keys(HABIT_SLUG_MAP).join(", "));
      return res
        .status(404)
        .send(
          `<h2>Unknown habit slug: ${escapeHtml(slug)}</h2><p>Valid slugs: ${valid}</p>`,
        );
    }

    let alreadyDone = false;

    try {
      if (!HABITS_DS) throw new Error("HABITS_DS not set");
      const notion = getNotion();
      const pageId = await findOrCreateTodayHabitPage(notion, HABITS_DS);

      const page = await (notion as any).pages.retrieve({ page_id: pageId });
      alreadyDone = page.properties?.[habitName]?.checkbox === true;

      if (!alreadyDone) {
        await (notion as any).pages.update({
          page_id: pageId,
          properties: { [habitName]: { checkbox: true } },
        });
      }
    } catch (e: any) {
      console.error("nfc error:", e.message);
      return res
        .status(200)
        .send(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#0f0f0f;color:#f0ede8"><h2>Sync failed</h2><p>${escapeHtml(e.message ?? "Unknown error")}</p></body></html>`,
        );
    }

    res.setHeader("Content-Type", "text/html");
    res.send(nfcConfirmationHtml(habitName, alreadyDone));
  });

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
