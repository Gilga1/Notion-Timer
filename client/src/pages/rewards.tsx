/**
 * Rewards page — placed in client/src/pages/rewards.tsx
 * Add to your router: <Route path="/rewards" component={Rewards} />
 * Add to your sidebar nav alongside Focus Timer / Dashboard / Settings
 */
import { useCallback, useEffect, useState } from "react";
import type { Reward, StreakData } from "@shared/schema-rewards";
import {
  UtensilsCrossed,
  Film,
  Gamepad2,
  BookOpen,
  Music,
  Zap,
  Gift,
  Flame,
  RefreshCw,
  CheckCircle2,
  Archive,
} from "lucide-react";

// -- API helpers ----------------------------------------------------------------
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

async function claimReward(id: string): Promise<Reward> {
  const r = await fetch(`/api/rewards/${id}/claim`, { method: "POST" });
  if (!r.ok) throw new Error("Claim failed");
  return r.json();
}

// -- Constants ------------------------------------------------------------------
const MILESTONES = [3, 7, 10, 14, 21, 30];

// Category colors removed — badge will be neutral stone tone per design


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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// -- Celebration overlay ---------------------------------------------------------
function CelebrationBanner({
  rewards,
  onDismiss,
}: {
  rewards: Reward[];
  onDismiss: () => void;
}) {
  if (rewards.length === 0) return null;
  const r = rewards[0];
  const Icon = ((): any => {
    switch (r.category) {
      case "food":
        return UtensilsCrossed;
      case "movie":
        return Film;
      case "game":
        return Gamepad2;
      case "book":
        return BookOpen;
      case "music":
        return Music;
      case "activity":
        return Zap;
      default:
        return Gift;
    }
  })();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden animate-[spring_0.5s_cubic-bezier(0.34,1.56,0.64,1)]">
        {/* Confetti strip */}
        <div className="h-2 bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-400" />
        <div className="p-8 text-center">
          <div className="mb-4 animate-bounce">
            <Icon className="w-14 h-14 mx-auto text-gray-900" />
          </div>
          <div className="text-xs font-semibold tracking-widest uppercase text-gray-500 mb-2">
            Reward Unlocked
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{r.title}</h2>
          <p className="text-sm text-gray-500 mb-2">{r.description}</p>
          <p className="text-sm text-gray-400 italic mb-6">{r.why}</p>
          <div className="flex gap-3 justify-center">
            {rewards.length > 1 && (
              <span className="text-sm text-muted-foreground self-center">
                +{rewards.length - 1} more reward{rewards.length > 2 ? "s" : ""}
              </span>
            )}
            <button
              onClick={onDismiss}
              className="px-6 py-3 bg-stone-100 text-stone-800 rounded-xl font-medium hover:bg-stone-50 transition-colors"
            >
              Awesome - save for later
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
  const nextMilestone = MILESTONES.find((m) => m > streak.currentStreak) ?? null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{label}</p>
          {streak.isComposite && (
            <span className="text-xs text-gray-600 font-medium">Combo streak</span>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {nextMilestone ? `Next reward at ${nextMilestone} days` : "All milestones completed"}
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-foreground">
            {streak.currentStreak}
          </span>
          <span className="text-xs text-muted-foreground ml-1">days</span>
        </div>
      </div>

      {/* Progress */}
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Milestones */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {MILESTONES.map((m) => {
          const isClaimed = claimedMilestones.includes(m);
          const isUnlocked = unlockedMilestones.includes(m);
          const isPast = streak.currentStreak >= m;

          const pillClass = isClaimed
            ? "bg-emerald-600 text-white"
            : isUnlocked
              ? "bg-amber-100 text-amber-800"
              : isPast
                ? "bg-emerald-50 text-emerald-700"
                : "bg-stone-100 text-stone-500";

          return (
            <span
              key={m}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${pillClass}`}
              title={
                isClaimed
                  ? "Reward claimed"
                  : isUnlocked
                    ? "Reward unlocked"
                    : isPast
                      ? "Milestone reached"
                      : "Upcoming"
              }
            >
              {isClaimed ? "\u2713" : isUnlocked ? "!" : ""}
              {m}d
            </span>
          );
        })}
      </div>

      {streak.longestStreak > streak.currentStreak && (
        <p className="text-xs text-muted-foreground">
          Personal best:{" "}
          <span className="font-medium text-muted-foreground">
            {streak.longestStreak} days
          </span>
        </p>
      )}
    </div>
  );
}

// -- Reward card -----------------------------------------------------------------
function RewardCard({
  reward,
  onClaim,
}: {
  reward: Reward;
  onClaim: (id: string) => Promise<void>;
}) {
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      await onClaim(reward.id);
    } catch (e: any) {
      console.error("claim reward error:", e?.message ?? e);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      className={`rounded-2xl p-5 transition-all border ${
        reward.status === "unlocked"
          ? "bg-amber-50 border-amber-100"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              reward.status === "unlocked" ? "bg-amber-50" : "bg-stone-100"
            }`}
          >
            {(() => {
              const Icon = ((): any => {
                switch (reward.category) {
                  case "food":
                    return UtensilsCrossed;
                  case "movie":
                    return Film;
                  case "game":
                    return Gamepad2;
                  case "book":
                    return BookOpen;
                  case "music":
                    return Music;
                  case "activity":
                    return Zap;
                  default:
                    return Gift;
                }
              })();
              return (
                <Icon
                  className={`w-5 h-5 ${
                    reward.status === "unlocked" ? "text-amber-600" : "text-stone-500"
                  }`} />
              );
            })()}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-medium text-gray-900 text-sm leading-tight">
              {reward.title}
            </h3>
            <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
              {reward.category}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-2 leading-relaxed">
            {reward.description}
          </p>
          <p className="text-xs text-gray-400 italic mb-3">
            {HABIT_LABELS[reward.habitKey] ?? reward.habitKey} - {reward.milestoneStreak}-day milestone
          </p>

          {reward.status === "unlocked" ? (
            <div className="mt-auto flex items-center justify-between gap-3">
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {claiming ? "Claiming..." : "Claim"}
              </button>
              <div className="text-xs text-gray-400">
                Unlocked {formatDate(reward.unlockedAt)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-auto text-xs text-gray-400">
              <Archive className="w-4 h-4" />
              <span>
                {reward.claimedAt ? `Claimed on ${formatDate(reward.claimedAt)}` : "Claimed"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Main page component --------------------------------------------------------
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
    } catch (e: any) {
      setError(e.message);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleClaim = async (id: string) => {
    setError(null);
    try {
      const claimedReward = await claimReward(id);
      setUnlocked((prev) => prev.filter((r) => r.id !== id));
      setClaimed((prev) => [claimedReward, ...prev]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to claim reward");
      throw e;
    }
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
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading habit streaks...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Celebration overlay */}
      <CelebrationBanner
        rewards={newRewards}
        onDismiss={() => setNewRewards([])}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rewards</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Earn treats by building consistent habits
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-stone-100 text-stone-800 rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          {syncing ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-stone-300 rounded-full animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Sync streaks</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Unlocked banner removed per design — count shown on tab */}

      {/* Tabs */}
      <div className="flex border-b border-border mb-5">
        {(["streaks", "unlocked", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-gray-900 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
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

      {/* Streaks tab */}
      {activeTab === "streaks" && (
        <div className="space-y-3">
            {streaks.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                <div className="mb-3">
                  <Flame className="w-8 h-8 mx-auto text-stone-600" />
                </div>
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

      {/* Unlocked tab */}
      {activeTab === "unlocked" && (
        <div className="space-y-3">
            {unlocked.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                <div className="mb-3">
                  <Gift className="w-8 h-8 mx-auto text-stone-600" />
                </div>
                <p>No unclaimed rewards yet.</p>
                <p className="mt-1">
                  Keep your streaks going — rewards unlock at 3, 7, 10, 14, 21,
                  and 30 days.
                </p>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="mt-4 px-4 py-2 text-sm bg-white border border-gray-100 hover:bg-stone-50 rounded-lg transition-colors disabled:opacity-50"
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
            <p className="text-xs text-center text-muted-foreground pt-2">
              Rewards accumulate — claim whenever you're ready 🎯
            </p>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="space-y-3">
            {claimed.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                <div className="mb-3">
                  <Archive className="w-8 h-8 mx-auto text-stone-600" />
                </div>
                <p>
                  No rewards claimed yet. Claim your first reward to see it here.
                </p>
              </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
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
