import fs from "fs";
import path from "path";
import type { InsertMeal, Meal, DailyNutritionSummary } from "@shared/schema";

const DB_PATH = process.env.MEALS_DB_PATH ?? path.resolve("meals.db.json");
const LOCK_PATH = DB_PATH + ".lock";
const TIME_ZONE = "Asia/Kolkata";

interface MealRow {
  id: number;
  taken_at: string;
  source: "manual" | "photo-ai";
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  title: string;
  notes: string | null;
  photo_url: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number | null;
  micros: Record<string, number> | null;
  synced_to_notion: boolean;
  notion_page_id: string | null;
}

function acquireLock(maxAttempts = 50): void {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fs.writeFileSync(LOCK_PATH, process.pid.toString(), { flag: "wx" });
      return;
    } catch (err: any) {
      if (err.code !== "EEXIST") throw err;
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {}
      if (i === maxAttempts - 1) throw new Error("Could not acquire meal lock");
    }
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {}
}

function load(): MealRow[] {
  acquireLock();
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {
  } finally {
    releaseLock();
  }
  return [];
}

function save(rows: MealRow[]) {
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

function rowToMeal(r: MealRow): Meal {
  return {
    id: r.id,
    takenAt: r.taken_at,
    source: r.source,
    mealType: r.meal_type,
    title: r.title,
    notes: r.notes ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fats: r.fats,
    fiber: r.fiber ?? undefined,
    micros: r.micros ?? undefined,
    syncedToNotion: r.synced_to_notion,
    notionPageId: r.notion_page_id ?? undefined,
  };
}

let rows: MealRow[] = load();

function nextId() {
  return rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
}

export class MealStorage {
  createMeal(data: InsertMeal): Meal {
    const row: MealRow = {
      id: nextId(),
      taken_at: data.takenAt ?? new Date().toISOString(),
      source: data.source,
      meal_type: data.mealType,
      title: data.title,
      notes: data.notes ?? null,
      photo_url: data.photoUrl ?? null,
      calories: data.calories,
      protein: data.protein ?? 0,
      carbs: data.carbs ?? 0,
      fats: data.fats ?? 0,
      fiber: data.fiber ?? null,
      micros: data.micros ?? null,
      synced_to_notion: data.syncedToNotion ?? false,
      notion_page_id: data.notionPageId ?? null,
    };

    rows.push(row);
    save(rows);
    return rowToMeal(row);
  }

  getAllMeals(): Meal[] {
    return [...rows]
      .sort((a, b) => b.taken_at.localeCompare(a.taken_at))
      .map(rowToMeal);
  }

  getMealsForDate(date: string): Meal[] {
    return rows
      .filter((r) => getDateInTimeZone(r.taken_at, TIME_ZONE) === date)
      .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
      .map(rowToMeal);
  }

  getTodayMeals(): Meal[] {
    return this.getMealsForDate(getTodayInTimeZone(TIME_ZONE));
  }

  getMealById(id: number): Meal | null {
    const row = rows.find((r) => r.id === id);
    return row ? rowToMeal(row) : null;
  }

  markSynced(id: number, notionPageId?: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    row.synced_to_notion = true;
    if (notionPageId) row.notion_page_id = notionPageId;
    save(rows);
  }

  getDailySummary(
    date: string,
    maintenanceCalories: number,
  ): DailyNutritionSummary {
    const meals = this.getMealsForDate(date);
    const totalCalories = meals.reduce((s, m) => s + m.calories, 0);
    const protein = meals.reduce((s, m) => s + m.protein, 0);
    const carbs = meals.reduce((s, m) => s + m.carbs, 0);
    const fats = meals.reduce((s, m) => s + m.fats, 0);
    const fiber = meals.reduce((s, m) => s + (m.fiber ?? 0), 0);

    return {
      date,
      maintenanceCalories,
      totalCalories,
      calorieDelta: totalCalories - maintenanceCalories,
      protein,
      carbs,
      fats,
      fiber,
      mealCount: meals.length,
    };
  }

  getTodaySummary(maintenanceCalories: number): DailyNutritionSummary {
    return this.getDailySummary(
      getTodayInTimeZone(TIME_ZONE),
      maintenanceCalories,
    );
  }
}

export const mealStorage = new MealStorage();
