import fs from "fs";
import path from "path";
import type { Session, InsertSession, UpdateSession } from "@shared/schema";

const DB_PATH = process.env.SESSION_DB_PATH ?? path.resolve("focus-timer.db.json");
const LOCK_PATH = DB_PATH + ".lock";

function acquireLock(maxAttempts = 50, intervalMs = 50): void {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fs.writeFileSync(LOCK_PATH, process.pid.toString(), { flag: "wx" });
      return;
    } catch (err: any) {
      if (err.code !== "EEXIST") throw err;
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {}
      if (i === maxAttempts - 1) throw new Error("Could not acquire lock");
    }
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {}
}

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
  acquireLock();
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch {} finally {
    releaseLock();
  }
  return [];
}

function save(rows: SessionRow[]) {
  acquireLock();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(rows, null, 2));
  } finally {
    releaseLock();
  }
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
let _lockCount = 0;

function getNextId(): number {
  return _rows.length > 0 ? Math.max(..._rows.map((r) => r.id)) + 1 : 1;
}

function reloadFromDisk() {
  _rows = load();
}

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
  patchSession(id: number, patch: UpdateSession): Session | undefined;
  deleteSession(id: number): boolean;
  getSessionById(id: number): Session | null;
  reload(): { count: number };
  getAllSessions(): Session[];
  getTodaySessions(): Session[];
  getActiveSession(): Session | null;
  markSynced(id: number): void;
}

export class Storage implements IStorage {
  createSession(data: InsertSession): Session {
    const id = getNextId();
    const row: SessionRow = {
      id,
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

  patchSession(id: number, patch: UpdateSession): Session | undefined {
    const row = _rows.find((r) => r.id === id);
    if (!row) return undefined;

    if (Object.prototype.hasOwnProperty.call(patch, "endedAt")) {
      row.ended_at = patch.endedAt ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "durationMins")) {
      row.duration_mins = patch.durationMins ?? null;
    }

    save(_rows);
    return rowToSession(row);
  }

  deleteSession(id: number): boolean {
    const before = _rows.length;
    _rows = _rows.filter((r) => r.id !== id);
    const changed = _rows.length !== before;
    if (changed) {
      save(_rows);
    }
    return changed;
  }

  getSessionById(id: number): Session | null {
    const row = _rows.find((r) => r.id === id);
    return row ? rowToSession(row) : null;
  }

  reload(): { count: number } {
    reloadFromDisk();
    return { count: _rows.length };
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
