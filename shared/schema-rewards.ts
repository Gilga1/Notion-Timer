/**
 * Frontend-facing reward types (also defined in server/rewards.ts for the store).
 * Prefer importing from here in client code.
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
  expiresAt: z.string().optional(),
});

export type Reward = z.infer<typeof rewardSchema>;

export const streakDataSchema = z.object({
  habit: z.string(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  lastChecked: z.string().optional(),
  isComposite: z.boolean(),
  label: z.string().optional(),
  description: z.string().optional(),
});
export type StreakData = z.infer<typeof streakDataSchema>;
