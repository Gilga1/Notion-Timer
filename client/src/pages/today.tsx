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
            stroke="#27272a"
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
          <span className="text-[9px] text-zinc-500 mt-0.5">{sub}</span>
        </div>
      </div>
      <span className="text-[11px] text-zinc-400">{label}</span>
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
            ? "bg-emerald-950/40 border-emerald-800/50"
            : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
        } ${loading ? "opacity-60" : ""}`}
    >
      <span className="text-lg flex-shrink-0">{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${checked ? "text-emerald-400 line-through decoration-emerald-600" : "text-zinc-100"}`}
        >
          {name}
        </p>
        <p className="text-xs text-zinc-500">{meta.time}</p>
      </div>

      {/* 7-day mini streak */}
      <div className="flex gap-0.5 items-center flex-shrink-0">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={`w-1.5 h-4 rounded-sm ${
              i < streak7 ? "bg-emerald-500" : "bg-zinc-800"
            }`}
          />
        ))}
      </div>

      <div
        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${
          checked ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"
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

const HABIT_ORDER = [
  "Thyroid Med",
  "Spine Mobility",
  "Morning Meds",
  "Eat Healthy",
  "Upskill",
  "Reading",
  "Coding",
  "Gym",
  "Fat Burner AM",
  "Skincare",
  "Topicals",
  "Journal",
  "Meds",
  "Fat Burner PM",
  "Isabgol",
];

export default function TodayPage() {
  const qc = useQueryClient();

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        Loading today…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-red-400 text-sm bg-red-950/30 rounded-xl m-4">
        {error instanceof Error ? error.message : "Failed to load"}
      </div>
    );
  }

  const { macros, targets, deepWork, streak7, habitsDone, habitsTotal, date } =
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
      ? "text-zinc-500"
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
          <h1 className="text-xl font-semibold text-zinc-100">Today</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <Link href="/meal">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-colors">
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
      <div className="flex items-center justify-around p-4 bg-zinc-900 border border-zinc-800 rounded-2xl mb-5">
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
          <span className="text-xl font-semibold text-zinc-100">
            {deepWork.todayHours}h
          </span>
          <span className="text-xs text-zinc-500">deep work</span>
          <span className="text-[10px] text-zinc-600">today</span>
        </div>
      </div>

      {/* Calorie delta */}
      {macros.calories > 0 && (
        <div className={`text-center text-sm font-medium mb-4 ${deltaColor}`}>
          {deltaSign}
          {macros.calorieDelta ?? 0} kcal from maintenance
          {(macros.calorieDelta ?? 0) <= -200 &&
          (macros.calorieDelta ?? 0) >= -400
            ? " · Good deficit 🎯"
            : (macros.calorieDelta ?? 0) > 200
              ? " · Over target ⚠️"
              : ""}
        </div>
      )}

      {/* Habits checklist */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Habits — {habitsDone}/{habitsTotal}
        </h2>
        <div className="h-1.5 flex-1 mx-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${habitPct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {HABIT_ORDER.map((name) => (
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
    </div>
  );
}
