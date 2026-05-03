/**
 * server/analyticsRoutes.ts
 *
 * Endpoints:
 *   GET /api/analytics/macros?days=30     — calorie + protein time series from Notion
 *   GET /api/analytics/habits?days=30     — per-habit compliance % + heatmap data
 *   GET /api/analytics/deepwork?days=30   — time-per-project aggregation from sessions
 *   GET /api/analytics/summary            — single combined snapshot for dashboard
 *
 * Add to server/routes.ts registerRoutes():
 *   import { registerAnalyticsRoutes } from "./analyticsRoutes";
 *   registerAnalyticsRoutes(app);
 */

import type { Express } from "express";
import { Client } from "@notionhq/client";
import { storage } from "./storage";

const HABITS_DB =
  process.env.HABITS_DS ?? "bd13c6c6-ca63-4ac6-8d55-75ac013b278b";
const MAINTENANCE = 2150;

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
  "Fat Burner PM",
  "Journal",
  "Meds",
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

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function parseDays(query: any, defaultDays = 30): number {
  const n = parseInt(query?.days ?? defaultDays, 10);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : defaultDays;
}

// Fetch last N days of habit pages from Notion (all fields)
async function fetchHabitPages(notion: Client, days: number) {
  const since = addDays(getTodayIST(), -days);
  let results: any[] = [];
  let cursor: string | undefined;

  do {
    const payload: any = {
      filter: { property: "Date", date: { on_or_after: since } },
      sorts: [{ property: "Date", direction: "ascending" }],
      page_size: 100,
    };
    if (cursor) payload.start_cursor = cursor;

    const resp = await (notion as any).databases.query({
      database_id: HABITS_DB,
      ...payload,
    });

    results = results.concat(resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  return results;
}

export function registerAnalyticsRoutes(app: Express) {
  // ── GET /api/analytics/macros ─────────────────────────────────────────────
  // Returns daily calorie + protein time series, gym vs rest day split, weekly averages
  app.get("/api/analytics/macros", async (req, res) => {
    try {
      const days = parseDays(req.query);
      const notion = getNotion();
      const pages = await fetchHabitPages(notion, days);

      const series = pages
        .map((page: any) => {
          const date = page.properties?.Date?.date?.start?.slice(0, 10) ?? "";
          const calories = page.properties?.["Calories"]?.number ?? null;
          const protein = page.properties?.["Protein (g)"]?.number ?? null;
          const delta = page.properties?.["Calorie Delta"]?.number ?? null;
          const gymDone = page.properties?.["Gym"]?.checkbox === true;

          return { date, calories, protein, delta, gymDone };
        })
        .filter((d) => d.date); // drop entries without a date

      // Summary stats
      const withCalories = series.filter(
        (d) => d.calories !== null && d.calories > 0,
      );
      const avgCalories = withCalories.length
        ? Math.round(
            withCalories.reduce((s, d) => s + d.calories!, 0) /
              withCalories.length,
          )
        : null;

      const withProtein = series.filter(
        (d) => d.protein !== null && d.protein > 0,
      );
      const avgProtein = withProtein.length
        ? Math.round(
            withProtein.reduce((s, d) => s + d.protein!, 0) /
              withProtein.length,
          )
        : null;

      const gymDays = series.filter((d) => d.gymDone).length;
      const restDays = series.length - gymDays;

      // Days where calorie target was hit (within ±150 kcal of gym/rest target)
      const targetHits = withCalories.filter((d) => {
        const target = d.gymDone ? 2150 : MAINTENANCE;
        return d.calories !== null && Math.abs(d.calories - target) <= 150;
      }).length;

      res.json({
        series,
        summary: {
          days: series.length,
          avgCalories,
          avgProtein,
          gymDays,
          restDays,
          targetHits,
          targetHitPct: withCalories.length
            ? Math.round((targetHits / withCalories.length) * 100)
            : null,
          maintenance: MAINTENANCE,
        },
        targets: { gymDay: 2150, restDay: MAINTENANCE, protein: 150 },
      });
    } catch (e: any) {
      console.error("analytics/macros error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/analytics/habits ─────────────────────────────────────────────
  // Returns per-habit compliance % + heatmap-ready daily data
  app.get("/api/analytics/habits", async (req, res) => {
    try {
      const days = parseDays(req.query);
      const notion = getNotion();
      const pages = await fetchHabitPages(notion, days);

      // Build daily matrix
      const daily = pages
        .map((page: any) => {
          const date = page.properties?.Date?.date?.start?.slice(0, 10) ?? "";
          const habits: Record<string, boolean> = {};
          let doneCount = 0;

          for (const h of ALL_HABITS) {
            const val = page.properties?.[h]?.checkbox === true;
            habits[h] = val;
            if (val) doneCount++;
          }

          return { date, habits, doneCount, totalHabits: ALL_HABITS.length };
        })
        .filter((d) => d.date);

      // Per-habit compliance
      const compliance = ALL_HABITS.map((habit) => {
        const done = daily.filter((d) => d.habits[habit]).length;
        const total = daily.length;
        return {
          habit,
          done,
          total,
          pct: total > 0 ? Math.round((done / total) * 100) : 0,
        };
      }).sort((a, b) => b.pct - a.pct);

      // Weekly completion averages
      const weeks: Record<string, { total: number; sum: number }> = {};
      for (const day of daily) {
        const [y, m, d] = day.date.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        const weekStart = new Date(dt);
        weekStart.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
        const wk = weekStart.toISOString().slice(0, 10);
        if (!weeks[wk]) weeks[wk] = { total: 0, sum: 0 };
        weeks[wk].total++;
        weeks[wk].sum += day.doneCount / day.totalHabits;
      }
      const weeklyAvg = Object.entries(weeks)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, { total, sum }]) => ({
          week,
          avgCompletion: Math.round((sum / total) * 100),
        }));

      res.json({ daily, compliance, weeklyAvg, habits: ALL_HABITS });
    } catch (e: any) {
      console.error("analytics/habits error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/analytics/deepwork ───────────────────────────────────────────
  // Aggregates focus timer sessions — time per project, daily hours, weekly trend
  app.get("/api/analytics/deepwork", async (req, res) => {
    try {
      const days = parseDays(req.query);
      const cutoff = addDays(getTodayIST(), -days);
      const sessions = storage.getAllSessions().filter((s) => {
        return s.startedAt >= cutoff && s.durationMins != null;
      });

      // Per-project totals
      const byProject: Record<
        string,
        { name: string; totalMins: number; sessionCount: number }
      > = {};
      for (const s of sessions) {
        if (!byProject[s.projectId]) {
          byProject[s.projectId] = {
            name: s.projectName,
            totalMins: 0,
            sessionCount: 0,
          };
        }
        byProject[s.projectId].totalMins += s.durationMins ?? 0;
        byProject[s.projectId].sessionCount += 1;
      }

      const projects = Object.entries(byProject)
        .map(([id, d]) => ({
          id,
          ...d,
          totalHours: parseFloat((d.totalMins / 60).toFixed(1)),
        }))
        .sort((a, b) => b.totalMins - a.totalMins);

      // Daily totals (for bar chart)
      const byDay: Record<string, number> = {};
      for (const s of sessions) {
        const day = s.startedAt.slice(0, 10);
        byDay[day] = (byDay[day] ?? 0) + (s.durationMins ?? 0);
      }
      const dailyHours = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, mins]) => ({
          date,
          hours: parseFloat((mins / 60).toFixed(1)),
        }));

      const totalMins = sessions.reduce((s, r) => s + (r.durationMins ?? 0), 0);
      const avgDailyH = dailyHours.length
        ? parseFloat(
            (
              dailyHours.reduce((s, d) => s + d.hours, 0) / dailyHours.length
            ).toFixed(1),
          )
        : 0;

      res.json({
        projects,
        dailyHours,
        summary: {
          totalHours: parseFloat((totalMins / 60).toFixed(1)),
          avgDailyHours: avgDailyH,
          sessionCount: sessions.length,
          days,
        },
      });
    } catch (e: any) {
      console.error("analytics/deepwork error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/analytics/summary ────────────────────────────────────────────
  // Single combined snapshot — used by the Today/Dashboard screen
  app.get("/api/analytics/summary", async (_req, res) => {
    try {
      const notion = getNotion();

      // Today's page
      const today = getTodayIST();
      const resp = await (notion as any).databases.query({
        database_id: HABITS_DB,
        filter: { property: "Date", date: { equals: today } },
        page_size: 1,
      });

      const page = resp.results[0];

      const habits: Record<string, boolean> = {};
      let habitsDone = 0;
      if (page) {
        for (const h of ALL_HABITS) {
          const val = page.properties?.[h]?.checkbox === true;
          habits[h] = val;
          if (val) habitsDone++;
        }
      }

      // Last 7 days streak compliance (quick)
      const recentPages = await fetchHabitPages(notion, 7);
      const streak7: Record<string, number> = {};
      for (const h of ALL_HABITS) {
        streak7[h] = recentPages.filter(
          (p: any) => p.properties?.[h]?.checkbox === true,
        ).length;
      }

      // Active session
      const activeSession = storage.getActiveSession();

      // Today's session total
      const todaySessions = storage.getTodaySessions();
      const todayMins = todaySessions
        .filter((s) => s.durationMins != null)
        .reduce((sum, s) => sum + (s.durationMins ?? 0), 0);

      res.json({
        date: today,
        habits,
        habitsDone,
        habitsTotal: ALL_HABITS.length,
        macros: {
          calories: page?.properties?.["Calories"]?.number ?? 0,
          protein_g: page?.properties?.["Protein (g)"]?.number ?? 0,
          calorieDelta: page?.properties?.["Calorie Delta"]?.number ?? null,
        },
        targets: { calories: 2150, maintenance: MAINTENANCE, protein: 150 },
        deepWork: {
          todayMins,
          todayHours: parseFloat((todayMins / 60).toFixed(1)),
          activeSession,
        },
        streak7,
      });
    } catch (e: any) {
      console.error("analytics/summary error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
