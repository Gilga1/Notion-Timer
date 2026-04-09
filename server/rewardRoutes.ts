/**
 * REWARD ROUTES — add these to your registerRoutes() function in routes.ts
 *
 * Usage in routes.ts:
 *   import { registerRewardRoutes } from "./rewardRoutes";
 *   // at the end of registerRoutes():
 *   registerRewardRoutes(app);
 *
 * Also add to your .env:
 *   OPENAI_API_KEY=sk-... (or set in your environment)
 *   HABITS_DS=bd13c6c6-ca63-4ac6-8d55-75ac013b278b   (already in your Notion)
 */

import type { Express } from "express";
import { fetchHabitStreaks } from "./habits";
import { rewardStore, STREAK_MILESTONES } from "./rewards";

export function registerRewardRoutes(app: Express) {
  // ── GET /api/habits/streaks — fetch current streaks from Notion ─────────────
  app.get("/api/habits/streaks", async (_req, res) => {
    try {
      const streaks = await fetchHabitStreaks();
      res.json(streaks);
    } catch (e: any) {
      console.error("habits/streaks error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/rewards/sync — check streaks and generate any new rewards ──────
  // Call this once on app load and periodically (e.g. daily cron or on page open)
  app.post("/api/rewards/sync", async (_req, res) => {
    try {
      const streaks = await fetchHabitStreaks();
      const newRewards = await rewardStore.syncWithStreaks(streaks);
      res.json({ newRewards, totalUnlocked: rewardStore.getUnlocked().length });
    } catch (e: any) {
      console.error("rewards/sync error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/rewards — all rewards (unlocked + claimed) ─────────────────────
  app.get("/api/rewards", (_req, res) => {
    res.json({
      unlocked: rewardStore.getUnlocked(),
      claimed: rewardStore.getClaimed(),
    });
  });

  // ── POST /api/rewards/:id/claim — mark a reward as claimed ──────────────────
  app.post("/api/rewards/:id/claim", (req, res) => {
    const reward = rewardStore.claimReward(req.params.id);
    if (!reward)
      return res
        .status(404)
        .json({ error: "Reward not found or already claimed" });
    res.json(reward);
  });

  // ── GET /api/rewards/milestones — metadata for progress track UI ─────────────
  app.get("/api/rewards/milestones", (_req, res) => {
    res.json({ milestones: STREAK_MILESTONES });
  });
}
