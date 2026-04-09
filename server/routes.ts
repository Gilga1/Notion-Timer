import type { Express } from "express";
import type { Server } from "http";
import { Client } from "@notionhq/client";
import { storage } from "./storage";
import { insertSessionSchema } from "@shared/schema";
import { registerRewardRoutes } from "./rewardRoutes";

// Prefer data_source_id when available, but fall back to databases.query for standard Notion API setups.
const PROJECTS_DS = process.env.PROJECTS_DS; // Projects collection
const TASKS_DS = process.env.TASKS_DS; // Tasks collection

function getNotion() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN not set");
  return new Client({ auth: token });
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
      const id = parseInt(req.params.id);
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
          console.error("Notion sync failed:", syncErr.message);
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
}
