/**
 * Rewards page — drop into client/src/pages/rewards.tsx
 * Add to your router: <Route path="/rewards" component={Rewards} />
 */

import { useState, useEffect, useCallback } from "react";
import type { Reward, StreakData } from "../shared/schema-rewards";

// ── API helpers ────────────────────────────────────────────────────────────────
async function fetchRewards(): Promise<{
  unlocked: Reward[];
  claimed: Reward[];
}> {
  const r = await fetch("/api/rewards");
  if (!r.ok) throw new Error("Failed to fetch rewards");
  return r.json();
}

async function fetchStreaks(): Promise<StreakData[]> {
  const r = await fetch("/api/habits/streaks");
  if (!r.ok) throw new Error("Failed to fetch streaks");
  return r.json();
}

async function syncRewards(): Promise<{
  newRewards: Reward[];
  totalUnlocked: number;
}> {
  const r = await fetch("/api/rewards/sync", { method: "POST" });
  if (!r.ok) throw new Error("Sync failed");
  return r.json();
}

// FIX 2: id typed as number to match Reward schema (change to string if your schema uses string PKs)
async function claimReward(id: number): Promise<Reward> {
  const r = await fetch(`/api/rewards/${id}/claim`, { method: "POST" });
  if (!r.ok) throw new Error("Claim failed");
  return r.json();
}

// ── Constants ──────────────────────────────────────────────────────────────────
const MILESTONES = [3, 7, 10, 14, 21, 30];

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-amber-50 border-amber-200 text-amber-700",
  movie: "bg-purple-50 border-purple-200 text-purple-700",
  game: "bg-blue-50 border-blue-200 text-blue-700",
  book: "bg-emerald-50 border-emerald-200 text-emerald-700",
  music: "bg-pink-50 border-pink-200 text-pink-700",
  activity: "bg-orange-50 border-orange-200 text-orange-700",
};

const HABIT_LABELS: Record<string, string> = {
  Coding: "Coding",
  Upskill: "Upskilling",
  Journal: "Journaling",
  "Eat Healthy": "Eating Healthy",
  Gym: "Gym",
  Reading: "Reading",
  Meds: "Meds",
  Skincare: "Skincare",
  upskilling: "Coding + Upskill combo",
  wellness: "Wellness trio",
  mind: "Mind stack",
};

// FIX 7: guard against undefined/null date
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Celebration overlay ────────────────────────────────────────────────────────
function CelebrationBanner({
  rewards,
  onDismiss,
}: {
  rewards: Reward[];
  onDismiss: () => void;
}) {
  if (rewards.length === 0) return null;
  const r = rewards[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden animate-bounce">
        <div className="h-2 bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-400" />
        <div className="p-8 text-center">
          <div className="text-7xl mb-4 animate-bounce">{r.emoji}</div>
          <div className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">
            🎉 Reward Unlocked
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{r.title}</h2>
          <p className="text-gray-600 mb-2">{r.description}</p>
          <p className="text-sm text-gray-400 italic mb-6">"{r.why}"</p>
          <div className="flex gap-3 justify-center">
            {rewards.length > 1 && (
              <span className="text-sm text-gray-400 self-center">
                +{rewards.length - 1} more reward{rewards.length > 2 ? "s" : ""}
              </span>
            )}
            <button
              onClick={onDismiss}
              className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
            >
              Awesome! Save for later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Streak progress track ──────────────────────────────────────────────────────
function StreakTrack({
  streak,
  claimedMilestones,
  unlockedMilestones,
}: {
  streak: StreakData;
  claimedMilestones: number[];
  unlockedMilestones: number[];
}) {
  const max = MILESTONES[MILESTONES.length - 1];
  const pct = Math.min((streak.currentStreak / max) * 100, 100);
  const label = HABIT_LABELS[streak.habit] ?? streak.habit;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{label}</p>
          {/* FIX 4: optional chaining on isComposite in case StreakData doesn't declare it */}
          {(streak as any).isComposite && (
            <span className="text-xs text-purple-500 font-medium">
              Combo streak
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-gray-900">
            {streak.currentStreak}
          </span>
          <span className="text-xs text-gray-400 ml-1">days</span>
        </div>
      </div>

      <div className="relative h-3 bg-gray-100 rounded-full overflow-visible mb-5">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
        {MILESTONES.map((m) => {
          const mPct = (m / max) * 100;
          const isClaimed = claimedMilestones.includes(m);
          const isUnlocked = unlockedMilestones.includes(m);
          const isPast = streak.currentStreak >= m;
          return (
            <div
              key={m}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${mPct}%` }}
            >
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] z-10 transition-all
                  ${
                    isClaimed
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : isUnlocked
                        ? "bg-yellow-400 border-yellow-400 text-white animate-pulse"
                        : isPast
                          ? "bg-emerald-400 border-emerald-400"
                          : "bg-white border-gray-300"
                  }`}
              >
                {isClaimed ? "✓" : isUnlocked ? "★" : ""}
              </div>
              <span className="text-[9px] text-gray-400 mt-1.5 font-medium">
                {m}d
              </span>
            </div>
          );
        })}
      </div>

      {streak.longestStreak > streak.currentStreak && (
        <p className="text-xs text-gray-400">
          Personal best:{" "}
          <span className="font-medium text-gray-600">
            {streak.longestStreak} days
          </span>
        </p>
      )}
    </div>
  );
}

// ── Reward card ────────────────────────────────────────────────────────────────
// FIX 2: onClaim accepts number (match Reward.id type — swap to string if needed)
function RewardCard({
  reward,
  onClaim,
}: {
  reward: Reward;
  onClaim: (id: number) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const colorClass =
    CATEGORY_COLORS[reward.category] ??
    "bg-gray-50 border-gray-200 text-gray-700";

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await onClaim(reward.id);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      className={`border rounded-2xl p-5 transition-all ${
        reward.status === "unlocked"
          ? "bg-white border-yellow-200 shadow-sm hover:shadow-md"
          : "bg-gray-50 border-gray-100"
      }`}
    >
      <div className="flex gap-4">
        <div className="text-4xl flex-shrink-0">{reward.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3
              className={`font-semibold text-sm leading-tight ${
                reward.status === "claimed" ? "text-gray-400" : "text-gray-900"
              }`}
            >
              {reward.title}
            </h3>
            <span
              className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}
            >
              {reward.category}
            </span>
          </div>
          <p
            className={`text-xs mb-2 leading-relaxed ${
              reward.status === "claimed" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {reward.description}
          </p>
          <p className="text-xs text-gray-400 italic mb-3">
            {HABIT_LABELS[reward.habitKey] ?? reward.habitKey} ·{" "}
            {reward.milestoneStreak}-day streak
          </p>

          {reward.status === "unlocked" && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {claiming ? "Claiming…" : "✓ Claim it!"}
              </button>
              {/* FIX 7: unlockedAt is now null-safe via updated formatDate */}
              <span className="text-xs text-gray-400">
                Unlocked {formatDate(reward.unlockedAt)}
              </span>
            </div>
          )}

          {reward.status === "claimed" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-600 font-medium">
                ✓ Claimed
              </span>
              {/* FIX 3: claimedAt is safely handled by updated formatDate */}
              <span className="text-xs text-gray-400">
                {formatDate(reward.claimedAt)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────────
export default function RewardsPage() {
  const [streaks, setStreaks] = useState<StreakData[]>([]);
  const [unlocked, setUnlocked] = useState<Reward[]>([]);
  const [claimed, setClaimed] = useState<Reward[]>([]);
  const [newRewards, setNewRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "streaks" | "unlocked" | "history"
  >("streaks");
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [streakData, rewardData] = await Promise.all([
        fetchStreaks(),
        fetchRewards(),
      ]);
      setStreaks(streakData);
      setUnlocked(rewardData.unlocked);
      setClaimed(rewardData.claimed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncRewards();
      if (result.newRewards.length > 0) {
        setNewRewards(result.newRewards);
      }
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSyncing(false);
    }
  };

  // FIX 1: renamed inner variable from `claimed` → `claimedReward` to avoid shadowing state
  const handleClaim = async (id: number) => {
    const claimedReward = await claimReward(id);
    setUnlocked((prev) => prev.filter((r) => r.id !== id));
    setClaimed((prev) => [claimedReward, ...prev]);
  };

  // Build milestone lookup for track rendering
  const claimedByHabit: Record<string, number[]> = {};
  const unlockedByHabit: Record<string, number[]> = {};
  [...claimed, ...unlocked].forEach((r) => {
    if (r.status === "claimed") {
      claimedByHabit[r.habitKey] = [
        ...(claimedByHabit[r.habitKey] ?? []),
        r.milestoneStreak,
      ];
    } else {
      unlockedByHabit[r.habitKey] = [
        ...(unlockedByHabit[r.habitKey] ?? []),
        r.milestoneStreak,
      ];
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading habit streaks…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <CelebrationBanner
        rewards={newRewards}
        onDismiss={() => setNewRewards([])}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rewards</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Earn treats by building consistent habits
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {syncing ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <span>↻</span> Sync streaks
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {unlocked.length > 0 && (
        <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⭐</span>
            <span className="text-sm font-medium text-yellow-800">
              {unlocked.length} reward{unlocked.length > 1 ? "s" : ""} waiting
              to be claimed
            </span>
          </div>
          <button
            onClick={() => setActiveTab("unlocked")}
            className="text-xs text-yellow-700 font-semibold hover:text-yellow-900 underline"
          >
            View
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-100 mb-5">
        {(["streaks", "unlocked", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab}
            {tab === "unlocked" && unlocked.length > 0 && (
              <span className="ml-1.5 text-xs bg-yellow-400 text-yellow-900 rounded-full px-1.5 py-0.5">
                {unlocked.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "streaks" && (
        <div className="space-y-3">
          {streaks.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <p className="text-3xl mb-3">📅</p>
              <p>
                No streak data yet. Make sure your Notion Habit Tracker is up to
                date.
              </p>
            </div>
          ) : (
            streaks
              .sort((a, b) => b.currentStreak - a.currentStreak)
              .map((s) => (
                <StreakTrack
                  key={s.habit}
                  streak={s}
                  claimedMilestones={claimedByHabit[s.habit] ?? []}
                  unlockedMilestones={unlockedByHabit[s.habit] ?? []}
                />
              ))
          )}
        </div>
      )}

      {activeTab === "unlocked" && (
        <div className="space-y-3">
          {unlocked.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <p className="text-3xl mb-3">🎁</p>
              <p>No unclaimed rewards yet.</p>
              <p className="mt-1">
                Keep your streaks going — rewards unlock at 3, 7, 10, 14, 21,
                and 30 days.
              </p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="mt-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Sync to check
              </button>
            </div>
          ) : (
            unlocked.map((r) => (
              <RewardCard key={r.id} reward={r} onClaim={handleClaim} />
            ))
          )}
          {unlocked.length > 0 && (
            <p className="text-xs text-center text-gray-400 pt-2">
              Rewards accumulate — claim whenever you're ready 🎯
            </p>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-3">
          {claimed.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <p className="text-3xl mb-3">📜</p>
              <p>
                No rewards claimed yet. Claim your first reward to see it here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                {claimed.length} reward{claimed.length !== 1 ? "s" : ""} claimed
              </p>
              {claimed.map((r) => (
                <RewardCard key={r.id} reward={r} onClaim={handleClaim} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
