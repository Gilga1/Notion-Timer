import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, CartesianGrid,
} from "recharts";
import { format, parseISO, startOfDay, subDays, eachDayOfInterval } from "date-fns";
import {
  BarChart3, Clock, Target, TrendingUp, Zap, Activity, Repeat, CalendarDays
} from "lucide-react";
import type { Session } from "@shared/schema";
import { cn } from "@/lib/utils";

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={cn("p-2.5 rounded-lg", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</div>
        <div className="text-xl font-bold text-foreground mt-0.5 font-mono">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#22c55e", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6",
  "#f97316", "#06b6d4", "#a3e635",
];

export default function DashboardPage() {
  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
    refetchInterval: 5000,
  });
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  if (isLoading) {
    return (
      <div className="p-10 flex items-center justify-center text-muted-foreground text-sm">
        Loading dashboard…
      </div>
    );
  }

  const completedSessions = sessions.filter(s => s.durationMins != null);

  // ── Today stats ──────────────────────────────────────────────────────────
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todaySessions = completedSessions.filter(s => s.startedAt.startsWith(todayStr));
  const todayMins = todaySessions.reduce((sum, s) => sum + (s.durationMins ?? 0), 0);

  // ── 7-day chart data ──────────────────────────────────────────────────────
  const last7 = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
  const dailyData = last7.map(day => {
    const dayStr = format(day, "yyyy-MM-dd");
    const dayMins = completedSessions
      .filter(s => s.startedAt.startsWith(dayStr))
      .reduce((sum, s) => sum + (s.durationMins ?? 0), 0);
    return {
      day: format(day, "EEE"),
      date: dayStr,
      mins: Math.round(dayMins),
      hrs: parseFloat((dayMins / 60).toFixed(2)),
      label: format(day, "EEE MMM d"),
    };
  });

  const weekTotalMins = dailyData.reduce((s, d) => s + d.mins, 0);
  const avgDailyMins = weekTotalMins / 7;

  // ── Per-task breakdown ────────────────────────────────────────────────────
  const taskMap: Record<string, { name: string; mins: number; project: string; sessions: number }> = {};
  completedSessions.forEach(s => {
    if (!taskMap[s.taskId]) {
      taskMap[s.taskId] = { name: s.taskName, mins: 0, project: s.projectName, sessions: 0 };
    }
    taskMap[s.taskId].mins += s.durationMins ?? 0;
    taskMap[s.taskId].sessions += 1;
  });
  const taskData = Object.values(taskMap)
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 10);

  // ── Pie chart (project breakdown) ─────────────────────────────────────────
  const projectMap: Record<string, number> = {};
  completedSessions.forEach(s => {
    projectMap[s.projectName] = (projectMap[s.projectName] ?? 0) + (s.durationMins ?? 0);
  });
  const pieData = Object.entries(projectMap)
    .map(([name, mins]) => ({ name, value: Math.round(mins) }))
    .sort((a, b) => b.value - a.value);

  const totalAllTimeMins = completedSessions.reduce((sum, s) => sum + (s.durationMins ?? 0), 0);
  const longestSession = completedSessions.reduce((max, s) => Math.max(max, s.durationMins ?? 0), 0);

  function fmtMins(mins: number) {
    if (mins < 60) return `${Math.round(mins)}m`;
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  }

  const todayIsTop = [...dailyData].sort((a, b) => b.mins - a.mins)[0]?.date === todayStr;

  const avgSessionMins = completedSessions.length
    ? totalAllTimeMins / completedSessions.length
    : 0;
  const activeDays = dailyData.filter(d => d.mins > 0).length;
  let longestStreak = 0;
  let tempStreak = 0;
  dailyData.forEach(d => {
    if (d.mins > 0) {
      tempStreak += 1;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  });
  let currentStreak = 0;
  for (let i = dailyData.length - 1; i >= 0; i--) {
    if (dailyData[i].mins > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }
  const peakDay = dailyData.reduce((best, day) => {
    if (!best || day.mins > best.mins) return day;
    return best;
  }, null as (typeof dailyData)[0] | null);
  const weeklyDates = new Set(dailyData.map(d => d.date));
  const weeklySessionCount = sessions.filter(s => weeklyDates.has(s.startedAt.slice(0, 10))).length;
  const sessionCount = completedSessions.length;
  const avgTodaySessions = todaySessions.length;

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your focus analytics across all sessions</p>
      </div>

      {completedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Target className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">No sessions yet</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            Start a focus session from the Timer tab and your analytics will appear here.
          </p>
        </div>
      ) : (
        <>
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          icon={Clock}
          label="Today"
          value={fmtMins(todayMins)}
          sub={`${todaySessions.length} session${todaySessions.length !== 1 ? "s" : ""}`}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          icon={TrendingUp}
          label="This Week"
          value={fmtMins(weekTotalMins)}
          sub={`avg ${fmtMins(avgDailyMins)}/day`}
          color="bg-green-500/10 text-green-500"
        />
        <StatCard
          icon={Zap}
          label="All Time"
          value={fmtMins(totalAllTimeMins)}
          sub={`${completedSessions.length} sessions`}
          color="bg-yellow-500/10 text-yellow-500"
        />
        <StatCard
          icon={Target}
          label="Best Session"
          value={fmtMins(longestSession)}
          sub={todayIsTop ? "🔥 Today is your best day!" : undefined}
          color="bg-pink-500/10 text-pink-500"
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Activity}
          label="Average session"
          value={fmtMins(avgSessionMins)}
          sub={`${sessionCount} logged`}
          color="bg-slate-500/10 text-slate-500"
        />
        <StatCard
          icon={Repeat}
          label="Longest streak"
          value={`${longestStreak} day${longestStreak !== 1 ? "s" : ""}`}
          sub="Most consistent run"
          color="bg-pink-500/10 text-pink-500"
        />
        <StatCard
          icon={CalendarDays}
          label="Current streak"
          value={`${currentStreak} day${currentStreak !== 1 ? "s" : ""}`}
          sub="Days with focus this week"
          color="bg-green-500/10 text-green-500"
        />
        <StatCard
          icon={BarChart3}
          label="Peak day"
          value={peakDay ? fmtMins(peakDay.mins) : "0m"}
          sub={peakDay ? peakDay.label : "No focus yet"}
          color="bg-primary/10 text-primary"
        />
      </div>

          {/* 7-day chart */}
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Last 7 Days</h2>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm text-muted-foreground">Focus time per day</p>
              <div className="inline-flex gap-2">
                {(["bar", "line"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                      chartType === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {type === "bar" ? "Bar" : "Line"}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              {chartType === "bar" ? (
                <BarChart data={dailyData} barSize={24}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}m`}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.75rem",
                      color: "hsl(var(--foreground))",
                      fontSize: "12px",
                    }}
                    formatter={(v: any) => [`${v}m`, "Focus Time"]}
                    labelFormatter={(value) => value}
                    cursor={{ fill: "hsl(var(--border))", radius: 8 }}
                  />
                  <Bar dataKey="mins" radius={[6, 6, 0, 0]}>
                    {dailyData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.date === todayStr ? "hsl(var(--primary))" : "hsl(var(--border))"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={dailyData}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}m`}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.75rem",
                      color: "hsl(var(--foreground))",
                      fontSize: "12px",
                    }}
                    formatter={(v: any) => [`${v}m`, "Focus Time"]}
                    labelFormatter={(value) => value}
                  />
                  <Line
                    type="monotone"
                    dataKey="mins"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Focus consistency</h2>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Days logged</span>
                <span>{activeDays}/7</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Current streak</span>
                <span>{currentStreak} day{currentStreak !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Longest streak</span>
                <span>{longestStreak} day{longestStreak !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Peak day</span>
                <span>{peakDay ? peakDay.label : "—"}</span>
              </div>
              <p className="text-foreground text-sm mt-3">
                {peakDay ? `Best focus day was ${peakDay.label} with ${fmtMins(peakDay.mins)}.` : "No focus sessions yet."}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Focus trends</h2>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Sessions this week</span>
                <span>{weeklySessionCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Avg focus per day</span>
                <span>{fmtMins(avgDailyMins)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg session length</span>
                <span>{fmtMins(avgSessionMins)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-3">
                {completedSessions.length === 0 ? "Start tracking sessions to populate the analytics." : "Tracking continues to fill your healthy focus habits."}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Project pie */}
            {pieData.length > 1 && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-sm font-semibold text-foreground mb-4">By Project</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.75rem",
                        color: "hsl(var(--foreground))",
                        fontSize: "12px",
                      }}
                      formatter={(v: any) => [`${v}m`, "Time"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 mt-2">
                  {pieData.slice(0, 4).map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate">{p.name}</span>
                      <span className="ml-auto font-mono text-foreground">{p.value}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top tasks */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Top Tasks</h2>
              {taskData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {taskData.slice(0, 5).map((t, i) => {
                    const pct = totalAllTimeMins > 0 ? (t.mins / totalAllTimeMins) * 100 : 0;
                    return (
                      <div key={t.name + i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-foreground font-medium truncate max-w-[160px]">{t.name}</span>
                          <span className="font-mono text-muted-foreground ml-2">{fmtMins(t.mins)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.project}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* All sessions log */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Session Log</h2>
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {completedSessions.slice(0, 30).map(s => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm"
                >
                  <div>
                    <span className="font-medium text-foreground">{s.taskName}</span>
                    <span className="text-muted-foreground mx-1.5">·</span>
                    <span className="text-muted-foreground text-xs">{s.projectName}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(s.startedAt), "MMM d, HH:mm")}
                    </span>
                    <span className="font-mono text-xs text-foreground">
                      {fmtMins(s.durationMins ?? 0)}
                    </span>
                    {s.syncedToNotion && (
                      <span className="text-xs text-green-500">✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
