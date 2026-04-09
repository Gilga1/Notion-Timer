import fs from "fs";
import path from "path";
import type { Session, InsertSession } from "@shared/schema";

const DB_PATH = process.env.SESSION_DB_PATH ?? path.resolve("focus-timer.db.json");

// In-memory store backed by a JSON file.
// Persist to disk as a JSON array on every write (simple, reliable, no native deps).

interface SessionRow {
  id: number;
  project_id: string;
  project_name: string;
  task_id: string;
  task_name: string;
  started_at: string;
  ended_at: string | null;
  duration_mins: number | null;
  synced_to_notion: boolean;
}

function load(): SessionRow[] {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  return [];
}

function save(rows: SessionRow[]) {
  fs.writeFileSync(DB_PATH, JSON.stringify(rows, null, 2));
}

function getDateInTimeZone(iso: string, timeZone: string) {
  const dt = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

function getTodayInTimeZone(timeZone: string) {
  return getDateInTimeZone(new Date().toISOString(), timeZone);
}

let _rows: SessionRow[] = load();
let _nextId = _rows.length > 0 ? Math.max(..._rows.map((r) => r.id)) + 1 : 1;

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    taskId: r.task_id,
    taskName: r.task_name,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? null,
    durationMins: r.duration_mins ?? null,
    syncedToNotion: r.synced_to_notion,
  };
}

export interface IStorage {
  createSession(data: InsertSession): Session;
  updateSession(id: number, endedAt: string, durationMins: number): Session | undefined;
  getAllSessions(): Session[];
  getTodaySessions(): Session[];
  getActiveSession(): Session | null;
  markSynced(id: number): void;
}

export class Storage implements IStorage {
  createSession(data: InsertSession): Session {
    const row: SessionRow = {
      id: _nextId++,
      project_id: data.projectId,
      project_name: data.projectName,
      task_id: data.taskId,
      task_name: data.taskName,
      started_at: data.startedAt,
      ended_at: data.endedAt ?? null,
      duration_mins: data.durationMins ?? null,
      synced_to_notion: false,
    };
    _rows.push(row);
    save(_rows);
    return rowToSession(row);
  }

  updateSession(id: number, endedAt: string, durationMins: number): Session | undefined {
    const row = _rows.find((r) => r.id === id);
    if (!row) return undefined;
    row.ended_at = endedAt;
    row.duration_mins = durationMins;
    save(_rows);
    return rowToSession(row);
  }

  getAllSessions(): Session[] {
    return [..._rows]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map(rowToSession);
  }

  getTodaySessions(): Session[] {
    const today = getTodayInTimeZone("Asia/Kolkata");
    return _rows
      .filter((r) => getDateInTimeZone(r.started_at, "Asia/Kolkata") === today)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map(rowToSession);
  }

  getActiveSession(): Session | null {
    const row = [..._rows]
      .filter((r) => r.ended_at == null)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    return row ? rowToSession(row) : null;
  }

  markSynced(id: number): void {
    const row = _rows.find((r) => r.id === id);
    if (row) {
      row.synced_to_notion = true;
      save(_rows);
    }
  }
}

export const storage = new Storage();
