import type { Express } from "express";
import type { Server } from "http";
import { Client } from "@notionhq/client";
import { storage } from "./storage";
import { mealStorage } from "./mealStorage";
import OpenAI from "openai";

import { registerHabitRoutes } from "./habitRoutes";
import { registerMealRoutes } from "./mealRoutes";
import { registerPushRoutes } from "./pushRoutes";
import { registerAnalyticsRoutes } from "./analyticsRoutes";

import {
  insertSessionSchema,
  updateSessionSchema,
  insertMealSchema,
  mealPhotoEstimateSchema,
  habitLogSchema,
} from "@shared/schema";
import { registerRewardRoutes } from "./rewardRoutes";

// Prefer data_source_id when available, but fall back to databases.query for standard Notion API setups.
const PROJECTS_DS = process.env.PROJECTS_DS; // Projects collection
const TASKS_DS = process.env.TASKS_DS; // Tasks collection
const NUTRITION_DS = process.env.NUTRITION_DS;
const HABITS_DS = process.env.HABITS_DS;
const APP_API_KEY = process.env.APP_API_KEY;
const DEFAULT_MAINTENANCE_CALORIES = Number(
  process.env.MAINTENANCE_CALORIES ?? 2400,
);

function getNotion() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN not set");
  if (token.length < 10) throw new Error("NOTION_TOKEN is invalid");
  return new Client({ auth: token });
}
function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: key });
}

function parseId(param: string): number | null {
  const id = parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}
function ensureAppKey(req: any, res: any, next: any) {
  if (!APP_API_KEY) return next();
  const key = req.header("x-api-key");
  if (key !== APP_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
async function queryNotionCollection(
  notion: any,
  id: string,
  queryPayload: any,
): Promise<any> {
  // Prefer data sources when supported, otherwise use databases.query or the raw request.
  if (notion?.dataSources && typeof notion.dataSources.query === "function") {
    return notion.dataSources.query({ data_source_id: id, ...queryPayload });
  }
  if (notion?.databases && typeof notion.databases.query === "function") {
    return notion.databases.query({ database_id: id, ...queryPayload });
  }
  return notion.request({
    path: `/databases/${id}/query`,
    method: "post",
    body: queryPayload,
  });
}
async function createNutritionPageInNotion(
  meal: ReturnType<typeof mealStorage.createMeal>,
) {
  if (!NUTRITION_DS || !process.env.NOTION_TOKEN) return null;

  const notion = getNotion();
  const properties: any = {
    Name: { title: [{ text: { content: meal.title } }] },
    Date: { date: { start: meal.takenAt } },
    Calories: { number: meal.calories },
    Protein: { number: meal.protein },
    Carbs: { number: meal.carbs },
    Fats: { number: meal.fats },
    MealType: { select: { name: meal.mealType } },
    Source: { select: { name: meal.source } },
  };

  if (typeof meal.fiber === "number") properties.Fiber = { number: meal.fiber };
  if (meal.notes)
    properties.Notes = { rich_text: [{ text: { content: meal.notes } }] };
  if (meal.photoUrl) properties.PhotoURL = { url: meal.photoUrl };

  const resp =
    notion?.dataSources && typeof notion.dataSources.create === "function"
      ? await notion.dataSources.create({
          parent: { data_source_id: NUTRITION_DS } as any,
          properties,
        } as any)
      : await notion.pages.create({
          parent: { database_id: NUTRITION_DS },
          properties,
        } as any);

  return resp?.id ?? null;
}

async function upsertDailyNutritionSummary(summary: {
  date: string;
  maintenanceCalories: number;
  totalCalories: number;
  calorieDelta: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  mealCount: number;
}) {
  if (!NUTRITION_DS || !process.env.NOTION_TOKEN) return null;
  const notion = getNotion();

  const existing = await queryNotionCollection(notion as any, NUTRITION_DS, {
    filter: {
      property: "Date",
      date: { equals: summary.date },
    },
    page_size: 1,
  });

  const properties: any = {
    Name: { title: [{ text: { content: `Nutrition ${summary.date}` } }] },
    Date: { date: { start: summary.date } },
    TotalCalories: { number: summary.totalCalories },
    MaintenanceCalories: { number: summary.maintenanceCalories },
    CalorieDelta: { number: summary.calorieDelta },
    Protein: { number: summary.protein },
    Carbs: { number: summary.carbs },
    Fats: { number: summary.fats },
    Fiber: { number: summary.fiber },
    MealCount: { number: summary.mealCount },
  };

  if (existing.results?.length) {
    const pageId = existing.results[0].id;
    await notion.pages.update({ page_id: pageId, properties } as any);
    return pageId;
  }

  const created = await notion.pages.create({
    parent: { database_id: NUTRITION_DS },
    properties,
  } as any);
  return created.id;
}

async function estimateMealFromImage(imageUrl: string) {
  const client = getOpenAI();
  const prompt = `
You are a nutrition estimator.
Given a food photo, estimate the most likely meal and return ONLY valid JSON:
{
  "title": "short meal name",
  "mealType": "breakfast" | "lunch" | "dinner" | "snack",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "fiber": number,
  "confidence": "low" | "medium" | "high",
  "notes": "short explanation"
}
Use one best estimate, not ranges.
`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl },
        ],
      },
    ],
    max_output_tokens: 400,
  } as any);

  const text =
    (response as any).output_text ??
    (Array.isArray((response as any).output)
      ? (response as any).output
          .map(
            (o: any) =>
              o?.content?.map((c: any) => c?.text ?? "").join("") ?? "",
          )
          .join("\n")
      : "");

  const clean = String(text)
    .replace(/```json|```/g, "")
    .trim();
  return mealPhotoEstimateSchema.parse(JSON.parse(clean));
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ── GET /api/projects — fetch active projects ─────────────────────────────
  app.get("/api/projects", async (_req, res) => {
    try {
      const notion = getNotion();
      if (!PROJECTS_DS) {
        return res.status(500).json({ error: "PROJECTS_DS not set" });
      }
      const queryPayload = {
        filter: {
          and: [
            { property: "Archive", checkbox: { equals: false } },
            {
              or: [
                { property: "Status", status: { equals: "In progress" } },
                { property: "Status", status: { equals: "Planned" } },
              ],
            },
          ],
        },
        sorts: [{ property: "Priority", direction: "ascending" }],
      };
      const response = await queryNotionCollection(
        notion as any,
        PROJECTS_DS,
        queryPayload,
      );

      const projects = (response.results as any[]).map((page: any) => ({
        id: page.id,
        name: page.properties?.Name?.title?.[0]?.plain_text ?? "Untitled",
        status: page.properties?.Status?.status?.name ?? "",
        priority: page.properties?.Priority?.select?.name ?? "",
      }));

      res.json(projects);
    } catch (e: any) {
      console.error("projects error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/tasks/:projectId — fetch tasks for a project ─────────────────
  app.get("/api/tasks/:projectId", async (req, res) => {
    try {
      const notion = getNotion();
      if (!TASKS_DS) {
        return res.status(500).json({ error: "TASKS_DS not set" });
      }
      const projectPageId = req.params.projectId;

      const queryPayload = {
        filter: {
          property: "Projects",
          relation: { contains: projectPageId },
        },
        sorts: [{ property: "Status", direction: "ascending" }],
      };
      const response = await queryNotionCollection(
        notion as any,
        TASKS_DS,
        queryPayload,
      );

      const tasks = (response.results as any[]).map((page: any) => ({
        id: page.id,
        name: page.properties?.Name?.title?.[0]?.plain_text ?? "Untitled",
        status:
          page.properties?.Status?.status?.name ??
          page.properties?.Completion?.status?.name ??
          "",
        timeSpentMins: page.properties?.["Time Spent (mins)"]?.number ?? 0,
        projectId: projectPageId,
      }));

      res.json(tasks);
    } catch (e: any) {
      console.error("tasks error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/sessions/start — start a timer session ─────────────────────
  app.post("/api/sessions/start", async (req, res) => {
    try {
      const data = insertSessionSchema.parse({
        ...req.body,
        startedAt: new Date().toISOString(),
      });
      const session = storage.createSession(data);
      res.json(session);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /api/sessions/:id/stop — stop & sync to Notion ──────────────────
  app.post("/api/sessions/:id/stop", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid id" });
      const endedAt = new Date().toISOString();

      const all = storage.getAllSessions();
      const activeSession = all.find((s) => s.id === id);
      if (!activeSession)
        return res.status(404).json({ error: "Session not found" });

      const startMs = new Date(activeSession.startedAt).getTime();
      const endMs = new Date(endedAt).getTime();
      const durationMins = parseFloat(((endMs - startMs) / 60000).toFixed(2));

      const session = storage.updateSession(id, endedAt, durationMins);

      // Sync duration back to Notion task's "Time Spent (mins)" field
      if (session && process.env.NOTION_TOKEN) {
        let syncFailed = false;
        let syncError = "";
        try {
          const notion = getNotion();
          const taskPage: any = await notion.pages.retrieve({
            page_id: session.taskId,
          });
          const existing =
            taskPage.properties?.["Time Spent (mins)"]?.number ?? 0;
          await notion.pages.update({
            page_id: session.taskId,
            properties: {
              "Time Spent (mins)": { number: existing + durationMins },
            },
          });
          storage.markSynced(id);
          session.syncedToNotion = true;
        } catch (syncErr: any) {
          syncFailed = true;
          syncError = syncErr.message ?? String(syncErr);
          console.error("Notion sync failed:", syncError);
        }
        if (syncFailed) {
          return res.status(507).json({
            error: "Session saved but Notion sync failed",
            details: syncError,
            session,
          });
        }
      }

      res.json(session);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/sessions/today ───────────────────────────────────────────────
  app.get("/api/sessions/today", (_req, res) => {
    res.json(storage.getTodaySessions());
  });

  // ── GET /api/sessions ─────────────────────────────────────────────────────
  app.get("/api/sessions", (_req, res) => {
    res.json(storage.getAllSessions());
  });

  // POST /api/sessions/reload — reload local session store from disk
  // Useful if you manually corrected `focus-timer.db.json` while the server is running.
  app.post("/api/sessions/reload", (_req, res) => {
    const result = storage.reload();
    res.json({ ok: true, ...result });
  });
  app.post("/api/habits/log", ensureAppKey, async (req, res) => {
    try {
      const payload = habitLogSchema.parse(req.body);

      if (!HABITS_DS) {
        return res.status(500).json({ error: "HABITS_DS not set" });
      }

      const notion = getNotion();
      const date = payload.date ?? new Date().toISOString().slice(0, 10);

      const properties: any = {
        Name: { title: [{ text: { content: payload.habitKey } }] },
        Date: { date: { start: date } },
        Habit: { rich_text: [{ text: { content: payload.habitKey } }] },
        Source: { select: { name: payload.source } },
        Done: { checkbox: true },
      };

      if (payload.notes) {
        properties.Notes = {
          rich_text: [{ text: { content: payload.notes } }],
        };
      }

      const page = await notion.pages.create({
        parent: { database_id: HABITS_DS },
        properties,
      } as any);

      res.json({
        ok: true,
        habitKey: payload.habitKey,
        date,
        notionPageId: page.id,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/meals", (_req, res) => {
    res.json(mealStorage.getAllMeals());
  });

  // NOTE: `/api/meals/today` is implemented in `server/mealRoutes.ts` and returns
  // rollup-based totals + targets. Keep this local-storage version on a
  // different path to avoid shadowing the Notion-backed endpoint.
  app.get("/api/meals/today/local", (_req, res) => {
    res.json(mealStorage.getTodayMeals());
  });

  app.get("/api/meals/summary/today", (_req, res) => {
    res.json(mealStorage.getTodaySummary(DEFAULT_MAINTENANCE_CALORIES));
  });

  app.post("/api/meals", ensureAppKey, async (req, res) => {
    try {
      const payload = insertMealSchema.parse({
        ...req.body,
        takenAt: req.body.takenAt ?? new Date().toISOString(),
      });

      const meal = mealStorage.createMeal(payload);
      let notionPageId: string | null = null;

      try {
        notionPageId = await createNutritionPageInNotion(meal);
        if (notionPageId) mealStorage.markSynced(meal.id, notionPageId);
      } catch (syncErr) {
        console.error("Meal -> Notion sync failed:", syncErr);
      }

      res.json({
        ...meal,
        notionPageId: notionPageId ?? meal.notionPageId,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/meals/from-photo", ensureAppKey, async (req, res) => {
    try {
      const imageUrl = String(req.body.imageUrl ?? "").trim();
      const mealType = req.body.mealType;
      if (!imageUrl) {
        return res.status(400).json({ error: "imageUrl is required" });
      }

      const estimate = await estimateMealFromImage(imageUrl);
      const meal = mealStorage.createMeal({
        takenAt: new Date().toISOString(),
        source: "photo-ai",
        mealType: mealType ?? estimate.mealType,
        title: estimate.title,
        calories: estimate.calories,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fats: estimate.fats,
        fiber: estimate.fiber,
        notes: estimate.notes,
        photoUrl: imageUrl,
      });

      let notionPageId: string | null = null;
      try {
        notionPageId = await createNutritionPageInNotion(meal);
        if (notionPageId) mealStorage.markSynced(meal.id, notionPageId);
      } catch (syncErr) {
        console.error("Photo meal -> Notion sync failed:", syncErr);
      }

      const summary = mealStorage.getTodaySummary(DEFAULT_MAINTENANCE_CALORIES);

      res.json({
        meal: {
          ...meal,
          notionPageId: notionPageId ?? meal.notionPageId,
        },
        summary,
        estimate,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/meals/summary/today/sync", ensureAppKey, async (_req, res) => {
    try {
      const summary = mealStorage.getTodaySummary(DEFAULT_MAINTENANCE_CALORIES);
      const pageId = await upsertDailyNutritionSummary(summary);
      res.json({ ok: true, pageId, summary });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/sessions/:id — edit a session, optionally sync delta to Notion
  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: "Invalid id" });

      const patch = updateSessionSchema.parse(req.body);

      const existing = storage.getSessionById(id);
      if (!existing)
        return res.status(404).json({ error: "Session not found" });

      // If only endedAt is provided, recompute duration from startedAt -> endedAt.
      // If durationMins is provided but endedAt is not, compute endedAt from startedAt + duration.
      let nextEndedAt = Object.prototype.hasOwnProperty.call(patch, "endedAt")
        ? patch.endedAt
        : undefined;
      let nextDuration = Object.prototype.hasOwnProperty.call(
        patch,
        "durationMins",
      )
        ? patch.durationMins
        : undefined;

      if (typeof nextDuration === "number" && nextEndedAt === undefined) {
        const startMs = new Date(existing.startedAt).getTime();
        if (!Number.isFinite(startMs)) {
          return res
            .status(400)
            .json({ error: "Invalid startedAt on session" });
        }
        const endMs = startMs + nextDuration * 60000;
        nextEndedAt = new Date(endMs).toISOString();
      }

      if (typeof nextEndedAt === "string" && nextDuration === undefined) {
        const startMs = new Date(existing.startedAt).getTime();
        const endMs = new Date(nextEndedAt).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
          return res.status(400).json({ error: "Invalid endedAt" });
        }
        nextDuration = parseFloat(((endMs - startMs) / 60000).toFixed(2));
      }

      const patchForStorage: any = {};
      if (nextEndedAt !== undefined) patchForStorage.endedAt = nextEndedAt;
      if (nextDuration !== undefined)
        patchForStorage.durationMins = nextDuration;

      const updated = storage.patchSession(id, patchForStorage);
      if (!updated) return res.status(404).json({ error: "Session not found" });

      // Optional: sync delta back to Notion task "Time Spent (mins)"
      if (patch.syncNotion && process.env.NOTION_TOKEN) {
        let syncFailed = false;
        let syncError = "";
        try {
          const prev = existing.durationMins ?? 0;
          const next = updated.durationMins ?? 0;
          const delta = next - prev;

          if (delta !== 0) {
            const notion = getNotion();
            const taskPage: any = await notion.pages.retrieve({
              page_id: updated.taskId,
            });
            const existingTime =
              taskPage.properties?.["Time Spent (mins)"]?.number ?? 0;
            const nextTime = Math.max(0, existingTime + delta);
            await notion.pages.update({
              page_id: updated.taskId,
              properties: {
                "Time Spent (mins)": { number: nextTime },
              },
            });
            storage.markSynced(id);
            updated.syncedToNotion = true;
          }
        } catch (syncErr: any) {
          syncFailed = true;
          syncError = syncErr.message ?? String(syncErr);
          console.error("Notion sync failed:", syncError);
        }
        if (syncFailed) {
          return res.status(507).json({
            error: "Session saved but Notion sync failed",
            details: syncError,
            session: updated,
          });
        }
      }

      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // DELETE /api/sessions/:id — delete a session locally
  app.delete("/api/sessions/:id", (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid id" });
    const ok = storage.deleteSession(id);
    if (!ok) return res.status(404).json({ error: "Session not found" });
    res.json({ ok: true });
  });

  app.get("/api/sessions/active", (_req, res) => {
    const active = storage.getActiveSession();
    res.json(active);
  });

  // ── GET /api/health ───────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, notionConfigured: !!process.env.NOTION_TOKEN });
  });

  // Register reward routes (includes /api/habits/streaks and /api/rewards/*)
  registerRewardRoutes(app);
  registerHabitRoutes(app);
  registerMealRoutes(app);
  registerPushRoutes(app);
  registerAnalyticsRoutes(app);
}
