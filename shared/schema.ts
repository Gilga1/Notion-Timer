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
