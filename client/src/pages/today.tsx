/**
 * client/src/pages/today.tsx
 *
 * The home screen. Shows:
 *   - Today's habit checklist (tap to check, syncs to Notion instantly)
 *   - Calorie + protein progress rings
 *   - Active focus session banner
 *   - 7-day habit streak mini-bars
 *
 * Add to your router (wouter):
 *   import Today from "./pages/today";
 *   <Route path="/" component={Today} />
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TodaySummary {
  date: string;
  habitList: string[];
  habits: Record<string, boolean>;
  habitsDone: number;
  habitsTotal: number;
  macros: { calories: number; protein_g: number; calorieDelta: number | null };
  targets: { calories: number; maintenance: number; protein: number };
  deepWork: {
    todayMins: number;
    todayHours: number;
    activeSession: any | null;
  };
  streak7: Record<string, number>;
  todayMeals: any[];
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchSummary(): Promise<TodaySummary> {
  const r = await fetch("/api/analytics/summary");
  if (!r.ok) throw new Error("Failed to fetch summary");
  return r.json();
}

async function toggleHabit(habit: string, checked: boolean): Promise<void> {
  const r = await fetch(`/api/habits/today/${encodeURIComponent(habit)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checked }),
  });
  if (!r.ok) throw new Error("Failed to update habit");
}

// ── Radial ring component ─────────────────────────────────────────────────────

function Ring({
  value,
  max,
  color,
  size = 80,
  label,
  sub,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  label: string;
  sub: string;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dash = pct * circ;
  const over = value > max;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor" className="text-secondary"
            strokeWidth={8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={over ? "#e05b5b" : color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-sm font-semibold leading-none"
            style={{ color: over ? "#e05b5b" : color }}
          >
            {value}
          </span>
          <span className="text-[9px] text-muted-foreground mt-0.5">{sub}</span>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Habit row ─────────────────────────────────────────────────────────────────

const HABIT_SCHEDULE: Record<string, { time: string; emoji: string }> = {
  "Thyroid Med": { time: "7:30 am", emoji: "💊" },
  "Spine Mobility": { time: "7:35 am", emoji: "🧘" },
  "Morning Meds": { time: "8:15 am", emoji: "💊" },
  "Eat Healthy": { time: "All day", emoji: "🥗" },
  Skincare: { time: "1:00 pm", emoji: "🧴" },
  Topicals: { time: "1:00 pm", emoji: "🧴" },
  Upskill: { time: "8:45 am", emoji: "📚" },
  Reading: { time: "8:45 am", emoji: "📖" },
  Coding: { time: "8:45 am", emoji: "💻" },
  Gym: { time: "11:00 am", emoji: "🏋️" },
  "Fat Burner AM": { time: "11:00 am", emoji: "🔥" },
  Journal: { time: "12:00 pm", emoji: "📓" },
  Meds: { time: "All day", emoji: "💊" },
  "Fat Burner PM": { time: "11:30 pm", emoji: "🔥" },
  Isabgol: { time: "11:30 pm", emoji: "🌾" },
};

function HabitRow({
  name,
  checked,
  streak7,
  onToggle,
  loading,
}: {
  name: string;
  checked: boolean;
  streak7: number;
  onToggle: () => void;
  loading: boolean;
}) {
  const meta = HABIT_SCHEDULE[name] ?? { time: "", emoji: "✓" };

  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
        ${
          checked
            ? "bg-primary/20 border-primary/50"
            : "bg-card border-border hover:bg-secondary/50"
        } ${loading ? "opacity-60" : ""}`}
    >
      <span className="text-lg flex-shrink-0">{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${checked ? "text-primary/80 line-through decoration-primary/60" : "text-foreground"}`}
        >
          {name}
        </p>
        <p className="text-xs text-muted-foreground">{meta.time}</p>
      </div>

      {/* 7-day mini streak */}
      <div className="flex gap-0.5 items-center flex-shrink-0">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={`w-1.5 h-4 rounded-sm ${
              i < streak7 ? "bg-primary" : "bg-secondary"
            }`}
          />
        ))}
      </div>

      <div
        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
          checked ? "bg-primary border-primary" : "border-muted-foreground/30"
        }`}
      >
        {checked && (
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TodayPage() {
  const qc = useQueryClient();

  const { data: health } = useQuery<{ ok: boolean; notionConfigured: boolean }>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const r = await fetch("/api/health");
      if (!r.ok) throw new Error();
      return r.json();
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["today-summary"],
    queryFn: fetchSummary,
    refetchInterval: 60_000, // refresh every minute
    staleTime: 30_000,
  });

  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<string | null>(null);

  // Merge server state with local optimistic updates
  const habits = { ...(data?.habits ?? {}), ...optimistic };

  const handleToggle = useCallback(
    async (name: string) => {
      if (toggling) return;
      const current = habits[name] ?? false;
      const next = !current;

      setOptimistic((p) => ({ ...p, [name]: next }));
      setToggling(name);

      try {
        await toggleHabit(name, next);
        // Invalidate so next background refetch gets fresh data
        qc.invalidateQueries({ queryKey: ["today-summary"] });
      } catch {
        // Revert on failure
        setOptimistic((p) => ({ ...p, [name]: current }));
      } finally {
        setToggling(null);
      }
    },
    [habits, toggling, qc],
  );

  if (health && !health.notionConfigured) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="p-6 bg-background border border-amber-500/30 rounded-2xl">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-xl">⚠️</span>
            <h2 className="text-sm font-semibold text-foreground">Notion Integration Required</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            It looks like your Notion connection is not configured yet. Please set your <code className="bg-secondary text-foreground px-1.5 py-0.5 rounded text-xs font-mono">NOTION_TOKEN</code> in your environment and restart the server to sync your habits, nutrition, and deep work tracking.
          </p>
          <Link href="/settings">
            <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium text-white transition-colors cursor-pointer">
              Go to Settings Setup Guide
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="h-8 bg-background rounded-lg w-1/3 mb-6 animate-pulse" />
        <div className="flex items-center justify-around p-4 bg-card border border-border rounded-2xl mb-5 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-secondary" />
          <div className="w-16 h-16 rounded-full bg-secondary" />
          <div className="w-16 h-16 rounded-full bg-secondary" />
          <div className="w-12 h-12 rounded-lg bg-secondary" />
        </div>
        <div className="h-4 bg-background rounded w-1/2 mb-8 animate-pulse mx-auto" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-background rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="p-6 bg-background/50 border border-red-500/30 rounded-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">⚠️</span>
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">
            {error instanceof Error ? error.message : "Failed to load"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            We encountered an error while trying to fetch your today summary.
          </p>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["today-summary"] })}
            className="px-6 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium rounded-xl transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { macros, targets, deepWork, streak7, habitsDone, habitsTotal, date, habitList, todayMeals } =
    data;

  const calPct =
    targets.calories > 0
      ? Math.round((macros.calories / targets.calories) * 100)
      : 0;
  const proPct =
    targets.protein > 0
      ? Math.round((macros.protein_g / targets.protein) * 100)
      : 0;
  const habitPct =
    habitsTotal > 0 ? Math.round((habitsDone / habitsTotal) * 100) : 0;

  const deltaSign = (macros.calorieDelta ?? 0) >= 0 ? "+" : "";
  const deltaColor =
    macros.calorieDelta === null
      ? "text-muted-foreground"
      : macros.calorieDelta <= 0
        ? "text-emerald-400"
        : macros.calorieDelta < 300
          ? "text-amber-400"
          : "text-red-400";

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Today</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <Link href="/meals">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-xl text-sm text-foreground transition-colors">
            <span>📷</span> Log meal
          </button>
        </Link>
      </div>

      {/* Active session banner */}
      {deepWork.activeSession && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-950/50 border border-blue-800/50 rounded-xl">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-300 truncate">
              {deepWork.activeSession.taskName}
            </p>
            <p className="text-xs text-blue-500">
              {deepWork.activeSession.projectName} · running
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-around p-4 bg-card border border-border rounded-2xl mb-5">
        <Ring
          value={macros.calories}
          max={targets.calories}
          color="#e09c40"
          label="Calories"
          sub="kcal"
        />
        <Ring
          value={macros.protein_g}
          max={targets.protein}
          color="#5b9bd5"
          label="Protein"
          sub="g"
        />
        <Ring
          value={habitsDone}
          max={habitsTotal}
          color="#4caf7d"
          label="Habits"
          sub={`${habitPct}%`}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl font-semibold text-foreground">
            {deepWork.todayHours}h
          </span>
          <span className="text-xs text-muted-foreground">deep work</span>
          <span className="text-[10px] text-muted-foreground/70">today</span>
        </div>
      </div>

      {/* Calorie delta gauge */}
      {macros.calories > 0 && (
        <div className="mb-8 px-2">
          <div className="flex justify-between items-end mb-2">
            <span className="text-sm text-muted-foreground">Calorie Delta</span>
            <span className={`text-sm font-semibold ${deltaColor}`}>
              {deltaSign}{macros.calorieDelta ?? 0} kcal
            </span>
          </div>
          
          <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-muted-foreground/30 z-10 -ml-[1px]" />
            {macros.calorieDelta !== null && (
              <div 
                className={`absolute inset-y-0 transition-all duration-700 ${macros.calorieDelta > 0 ? 'bg-red-500/80 left-1/2' : 'bg-emerald-500/80 right-1/2'}`}
                style={{ 
                  width: `${Math.min(100, Math.abs(macros.calorieDelta) / 500 * 50)}%`,
                }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
            <span>Deficit</span>
            <span>Maintenance</span>
            <span>Surplus</span>
          </div>
        </div>
      )}

      {/* Habits checklist */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Habits — {habitsDone}/{habitsTotal}
        </h2>
        <div className="h-1.5 flex-1 mx-3 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${habitPct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {habitList?.map((name) => (
          <HabitRow
            key={name}
            name={name}
            checked={habits[name] ?? false}
            streak7={streak7[name] ?? 0}
            onToggle={() => handleToggle(name)}
            loading={toggling === name}
          />
        ))}
      </div>

      {/* Meals Timeline */}
      {todayMeals && todayMeals.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Meals Today — {todayMeals.length}
          </h2>
          <div className="relative border-l border-border ml-3 space-y-6">
            {todayMeals.map((meal, i) => {
              const time = new Date(meal.takenAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <div key={meal.id} className="relative pl-6">
                  <div className="absolute w-2.5 h-2.5 bg-background border-2 border-muted-foreground/30 rounded-full -left-[5px] top-1.5" />
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-foreground">{meal.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{time} · {meal.mealType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{meal.calories} <span className="text-[10px] text-muted-foreground font-normal">kcal</span></p>
                      <p className="text-xs text-blue-400 font-medium">{meal.protein}g protein</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
