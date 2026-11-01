import type { Express } from "express";
import { fetchHabitStreaks } from "./habits";
import { rewardStore, STREAK_MILESTONES } from "./rewards";
import { ensureAppKey } from "./notionShared";

export function registerRewardRoutes(app: Express) {
  app.get("/api/habits/streaks", async (_req, res) => {
    try {
      const streaks = await fetchHabitStreaks();
      res.json(streaks);
    } catch (e: any) {
      console.error("habits/streaks error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rewards/sync", ensureAppKey, async (_req, res) => {
    try {
      const streaks = await fetchHabitStreaks();
      const newRewards = await rewardStore.syncWithStreaks(streaks);
      res.json({ newRewards, totalUnlocked: rewardStore.getUnlocked().length });
    } catch (e: any) {
      console.error("rewards/sync error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/rewards", (_req, res) => {
    res.json({
      unlocked: rewardStore.getUnlocked(),
      claimed: rewardStore.getClaimed(),
    });
  });

  app.post("/api/rewards/:id/claim", ensureAppKey, (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const reward = rewardStore.claimReward(String(id ?? ""));
    if (!reward)
      return res
        .status(404)
        .json({ error: "Reward not found or already claimed" });
    res.json(reward);
  });

  app.get("/api/rewards/milestones", (_req, res) => {
    res.json({ milestones: STREAK_MILESTONES });
  });

  app.post("/api/rewards/reload", ensureAppKey, (_req, res) => {
    rewardStore.reload();
    res.json({
      ok: true,
      count: rewardStore.getAll().length,
    });
  });
}
