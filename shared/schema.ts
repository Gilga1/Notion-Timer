import { z } from "zod";

// Session — stored locally in a JSON file (no native SQLite needed)
export const insertSessionSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  taskId: z.string(),
  taskName: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable().optional(),
  durationMins: z.number().nullable().optional(),
  syncedToNotion: z.boolean().optional(),
});

export type InsertSession = z.infer<typeof insertSessionSchema>;

export const updateSessionSchema = z.object({
  endedAt: z.string().nullable().optional(),
  durationMins: z.number().min(0).nullable().optional(),
  // If true, apply the change (delta) back to Notion task's "Time Spent (mins)".
  // Default is false to avoid accidental double-edits when you already corrected Notion manually.
  syncNotion: z.boolean().optional(),
});

export type UpdateSession = z.infer<typeof updateSessionSchema>;

export interface Session {
  id: number;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  startedAt: string;
  endedAt: string | null;
  durationMins: number | null;
  syncedToNotion: boolean;
}

// Notion types (fetched live, never stored)
export const notionProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  priority: z.string().optional(),
});
export type NotionProject = z.infer<typeof notionProjectSchema>;

export const notionTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  timeSpentMins: z.number().optional(),
  projectId: z.string().optional(),
});
export type NotionTask = z.infer<typeof notionTaskSchema>;

export const mealMicrosSchema = z.record(z.string(), z.number());

export const insertMealSchema = z.object({
  takenAt: z.string().optional(),
  source: z.enum(["manual", "photo-ai"]).default("manual"),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("snack"),
  title: z.string().min(1),
  notes: z.string().optional(),
  photoUrl: z.string().optional(),
  calories: z.number().min(0),
  protein: z.number().min(0).default(0),
  carbs: z.number().min(0).default(0),
  fats: z.number().min(0).default(0),
  fiber: z.number().min(0).optional(),
  micros: mealMicrosSchema.optional(),
  syncedToNotion: z.boolean().optional(),
  notionPageId: z.string().optional(),
});

export type InsertMeal = z.infer<typeof insertMealSchema>;

export const mealSchema = insertMealSchema.extend({
  id: z.number(),
  takenAt: z.string(),
  syncedToNotion: z.boolean(),
  notionPageId: z.string().nullable().optional(),
});

export type Meal = z.infer<typeof mealSchema>;

export const mealPhotoEstimateSchema = z.object({
  title: z.string(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("snack"),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fats: z.number(),
  fiber: z.number().optional(),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  notes: z.string().optional(),
  micros: mealMicrosSchema.optional(),
});

export type MealPhotoEstimate = z.infer<typeof mealPhotoEstimateSchema>;

export const dailyNutritionSummarySchema = z.object({
  date: z.string(),
  maintenanceCalories: z.number(),
  totalCalories: z.number(),
  calorieDelta: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fats: z.number(),
  fiber: z.number(),
  mealCount: z.number(),
});

export type DailyNutritionSummary = z.infer<typeof dailyNutritionSummarySchema>;

export const habitLogSchema = z.object({
  habitKey: z.string().min(1),
  date: z.string().optional(),
  notes: z.string().optional(),
  source: z.enum(["manual", "nfc", "macrodroid", "photo-ai"]).default("manual"),
});

export type HabitLogInput = z.infer<typeof habitLogSchema>;
