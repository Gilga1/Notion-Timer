import { Client } from "@notionhq/client";
import type { Request, Response, NextFunction } from "express";

/** Require HABITS_DS / MEALS_DS from env — no hardcoded workspace IDs. */
export const HABITS_DS = process.env.HABITS_DS ?? "";
export const MEALS_DS = process.env.MEALS_DS ?? "";
export const PROJECTS_DS = process.env.PROJECTS_DS ?? "";
export const TASKS_DS = process.env.TASKS_DS ?? "";
export const NUTRITION_DS = process.env.NUTRITION_DS ?? "";
export const APP_API_KEY = process.env.APP_API_KEY;
export const MAINTENANCE_CALORIES = Number(
  process.env.MAINTENANCE_CALORIES ?? 2150,
);
export const TIME_ZONE = "Asia/Kolkata";

export function getNotion(): Client {
  const token = process.env.NOTION_TOKEN;
  if (!token || token.length < 10) {
    throw new Error("NOTION_TOKEN not set or invalid");
  }
  return new Client({ auth: token });
}

export function getTodayIST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDateInIST(iso: string): string {
  return getTodayIST(new Date(iso));
}

/** Optional API key gate. When APP_API_KEY is set, require matching x-api-key. */
export function ensureAppKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!APP_API_KEY) return next();
  const key = req.header("x-api-key");
  if (key !== APP_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function queryNotionCollection(
  notion: any,
  id: string,
  queryPayload: any,
): Promise<any> {
  if (!id) throw new Error("Notion collection id is not configured");
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

/**
 * Create a page inside a Notion database / data source.
 * Prefer parent.data_source_id when the SDK supports data sources.
 */
export async function createPageInCollection(
  notion: any,
  collectionId: string,
  properties: any,
): Promise<any> {
  if (!collectionId) throw new Error("Notion collection id is not configured");
  try {
    return await notion.pages.create({
      parent: { data_source_id: collectionId },
      properties,
    });
  } catch {
    return await notion.pages.create({
      parent: { database_id: collectionId },
      properties,
    });
  }
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Find today's habit page, or create it. Re-queries after create to reduce
 * duplicate-page races when two requests run concurrently.
 */
export async function findOrCreateTodayHabitPage(
  notion: Client,
  habitsDb: string = HABITS_DS,
): Promise<string> {
  if (!habitsDb) throw new Error("HABITS_DS is not configured");
  const today = getTodayIST();

  const find = async () =>
    queryNotionCollection(notion, habitsDb, {
      filter: { property: "Date", date: { equals: today } },
      page_size: 5,
    });

  const first = await find();
  if (first.results?.length > 0) {
    // Prefer the oldest page if duplicates already exist
    const sorted = [...first.results].sort((a: any, b: any) =>
      String(a.created_time ?? "").localeCompare(String(b.created_time ?? "")),
    );
    return sorted[0].id as string;
  }

  try {
    const created = await createPageInCollection(notion, habitsDb, {
      Name: { title: [{ text: { content: today } }] },
      Date: { date: { start: today } },
    });
    return created.id as string;
  } catch (err) {
    // Another request may have created it — re-query
    const again = await find();
    if (again.results?.length > 0) {
      return again.results[0].id as string;
    }
    throw err;
  }
}

/** Read rollup/formula/number macros from a Habit Tracker page. */
export function extractHabitMacros(page: any) {
  const props = page?.properties ?? {};
  const num = (...keys: string[]): number | null => {
    for (const key of keys) {
      const p = props[key];
      if (!p) continue;
      if (typeof p.number === "number") return p.number;
      if (typeof p.formula?.number === "number") return p.formula.number;
      if (typeof p.rollup?.number === "number") return p.rollup.number;
      // Some rollups expose array of numbers
      if (Array.isArray(p.rollup?.array)) {
        const sum = p.rollup.array.reduce((acc: number, item: any) => {
          if (typeof item?.number === "number") return acc + item.number;
          return acc;
        }, 0);
        if (p.rollup.array.length) return sum;
      }
    }
    return null;
  };

  return {
    calories: num(
      "Calories (Rollup)",
      "Calories Rollup (g)",
      "Calories",
      "Calories Rollup",
    ),
    proteinG: num("Protein Rollup (g)", "Protein Rollup(g)", "Protein (g)"),
    calorieDelta: num("Calorie Delta"),
  };
}
