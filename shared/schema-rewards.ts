/**
 * ADD THESE to your existing shared/schema.ts
 * These are the frontend-facing types for the rewards system.
 */

import { z } from "zod";

export const rewardCategorySchema = z.enum([
  "food",
  "movie",
  "game",
  "book",
  "music",
  "activity",
]);
export type RewardCategory = z.infer<typeof rewardCategorySchema>;

export const rewardStatusSchema = z.enum(["unlocked", "claimed", "expired"]);
export type RewardStatus = z.infer<typeof rewardStatusSchema>;

export const rewardSchema = z.object({
  id: z.string(),
  habitKey: z.string(),
  milestoneStreak: z.number(),
  title: z.string(),
  description: z.string(),
  category: rewardCategorySchema,
  emoji: z.string(),
  why: z.string(),
  status: rewardStatusSchema,
  unlockedAt: z.string(),
  claimedAt: z.string().optional(),
});
export type Reward = z.infer<typeof rewardSchema>;

export const streakDataSchema = z.object({
  habit: z.string(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  lastChecked: z.string(),
  isComposite: z.boolean(),
});
export type StreakData = z.infer<typeof streakDataSchema>;
