import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Play, Square, RotateCcw, Coffee, BookOpen, ChevronDown, Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotionProject, NotionTask, Session } from "@shared/schema";

// Pomodoro config
const POMODORO_CYCLES = [
  { type: "work", mins: 45, label: "Focus" },
  { type: "break", mins: 5, label: "Short Break" },
  { type: "work", mins: 45, label: "Focus" },
  { type: "break", mins: 10, label: "Long Break" },
];

type Mode = "stopwatch" | "pomodoro";

type PersistedState = {
  mode: Mode;
  isRunning: boolean;
  elapsed: number;
  activeSessionId: number | null;
  startedAtMs: number | null;
  selectedProject: { id: string; name: string } | null;
  selectedTask: { id: string; name: string } | null;
  cycleIdx: number;
  pomodoroRunning: boolean;
  pomodoroRemaining: number;
  pomodoroEndAtMs: number | null;
};

const STORAGE_KEY = "focus-timer-state";
const STOPWATCH_NOTIFY_MINS = 45;
const REMINDER_KEY = "focus-timer-stopwatch-reminder";

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

function savePersistedState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function notifyUser(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {}
}

function readReminderEnabled() {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function TimerRing({ progress, isWork, size = 280 }: { progress: number; isWork: boolean; size?: number }) {
  const r = (size - 20) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
      {/* Background ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Progress ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={isWork ? "hsl(var(--primary))" : "hsl(var(--success))"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
      />
    </svg>
  );
}

export default function TimerPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("stopwatch");

  // ── Project/Task selection ─────────────────────────────────────────────────
  const [projectSearch, setProjectSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<NotionProject | null>(null);
  const [selectedTask, setSelectedTask] = useState<NotionTask | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  // ── Stopwatch state ────────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingStopRef = useRef(false);
  const notified45Ref = useRef(false);

  // ── Pomodoro state ─────────────────────────────────────────────────────────
  const [cycleIdx, setCycleIdx] = useState(0);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroRemaining, setPomodoroRemaining] = useState(POMODORO_CYCLES[0].mins * 60);
  const [pomodoroEndAtMs, setPomodoroEndAtMs] = useState<number | null>(null);
  const pomIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPomStopRef = useRef(false);
  const restoredRef = useRef(false);
  const [reminderEnabled, setReminderEnabled] = useState(() => readReminderEnabled());

  const currentCycle = POMODORO_CYCLES[cycleIdx % POMODORO_CYCLES.length];
  const isWorkCycle = currentCycle.type === "work";

  // ── Fetch projects ─────────────────────────────────────────────────────────
  const { data: projects = [], isLoading: projectsLoading } = useQuery<NotionProject[]>({
    queryKey: ["/api/projects"],
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch tasks ────────────────────────────────────────────────────────────
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<NotionTask[]>({
    queryKey: ["/api/tasks", selectedProject?.id],
    enabled: !!selectedProject,
    staleTime: 2 * 60 * 1000,
  });

  const { data: todaySessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/sessions/today"],
    refetchInterval: 5000,
  });

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredTasks = tasks.filter(t =>
    t.name.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const completedTodayMins = todaySessions
    .filter(s => s.durationMins != null)
    .reduce((sum, s) => sum + (s.durationMins ?? 0), 0);
  const activeMins = activeSessionId && startedAtMs
    ? (Date.now() - startedAtMs) / 60000
    : 0;
  const totalTodayMins = completedTodayMins + activeMins;

  // â”€â”€ Restore persisted state + active session on first mount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    setReminderEnabled(readReminderEnabled());

    const saved = loadPersistedState();
    if (saved) {
      setMode(saved.mode);
      setIsRunning(saved.isRunning);
      setElapsed(saved.elapsed);
      setActiveSessionId(saved.activeSessionId);
      setStartedAtMs(saved.startedAtMs);
      setSelectedProject(saved.selectedProject ? { ...saved.selectedProject } as NotionProject : null);
      setSelectedTask(saved.selectedTask ? { ...saved.selectedTask } as NotionTask : null);
      setCycleIdx(saved.cycleIdx);
      setPomodoroRunning(saved.pomodoroRunning);
      setPomodoroRemaining(saved.pomodoroRemaining);
      setPomodoroEndAtMs(saved.pomodoroEndAtMs);
    }

    (async () => {
      try {
        const res = await apiRequest("GET", "/api/sessions/active");
        const active: Session | null = await res.json();
        if (active && active.id) {
          setActiveSessionId(active.id);
          const startedMs = Date.parse(active.startedAt);
          if (!Number.isNaN(startedMs)) {
            setStartedAtMs(startedMs);
          }
          if (!saved?.isRunning && !saved?.pomodoroRunning) {
            setIsRunning(true);
          }
          if (!saved?.selectedProject) {
            setSelectedProject({ id: active.projectId, name: active.projectName });
          }
          if (!saved?.selectedTask) {
            setSelectedTask({ id: active.taskId, name: active.taskName });
          }
        } else if (saved?.isRunning || saved?.pomodoroRunning) {
          setIsRunning(false);
          setPomodoroRunning(false);
          setActiveSessionId(null);
          setStartedAtMs(null);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === REMINDER_KEY) {
        setReminderEnabled(readReminderEnabled());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // â”€â”€ Persist state (prevents timer reset across tabs/navigation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    savePersistedState({
      mode,
      isRunning,
      elapsed,
      activeSessionId,
      startedAtMs,
      selectedProject: selectedProject ? { id: selectedProject.id, name: selectedProject.name } : null,
      selectedTask: selectedTask ? { id: selectedTask.id, name: selectedTask.name } : null,
      cycleIdx,
      pomodoroRunning,
      pomodoroRemaining,
      pomodoroEndAtMs,
    });
  }, [
    mode,
    isRunning,
    elapsed,
    activeSessionId,
    startedAtMs,
    selectedProject,
    selectedTask,
    cycleIdx,
    pomodoroRunning,
    pomodoroRemaining,
    pomodoroEndAtMs,
  ]);

  // ── Start session mutation ─────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sessions/start", data),
    onSuccess: async (res) => {
      const session: Session = await res.json();
      setActiveSessionId(session.id);
      const startedMs = Date.parse(session.startedAt);
      if (!Number.isNaN(startedMs)) {
        setStartedAtMs(startedMs);
      }
      qc.invalidateQueries({ queryKey: ["/api/sessions/today"] });
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        stopMutation.mutate(session.id);
        setActiveSessionId(null);
        setIsRunning(false);
        setElapsed(0);
        setStartedAtMs(null);
      }
      if (pendingPomStopRef.current) {
        pendingPomStopRef.current = false;
        stopMutation.mutate(session.id);
        setActiveSessionId(null);
        setPomodoroRunning(false);
        setPomodoroEndAtMs(null);
      }
    },
    onError: () => {
      setIsRunning(false);
      setPomodoroRunning(false);
      setStartedAtMs(null);
      setPomodoroEndAtMs(null);
      toast({ title: "Failed to start session", variant: "destructive" });
    },
  });

  // ── Stop session mutation ──────────────────────────────────────────────────
  const stopMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/sessions/${id}/stop`, {}),
    onSuccess: async (res) => {
      const session: Session = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/sessions/today"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks", selectedProject?.id] });
      const synced = session?.syncedToNotion;
      toast({
        title: "Session saved",
        description: synced ? "Time synced to Notion ✓" : "Saved locally (Notion not connected)",
      });
    },
    onError: () => toast({ title: "Failed to save session", variant: "destructive" }),
  });

  // ── Stopwatch controls ────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!selectedTask || !selectedProject) {
      toast({ title: "Select a project and task first", variant: "destructive" });
      return;
    }
    requestNotificationPermission();
    pendingStopRef.current = false;
    setIsRunning(true);
    setElapsed(0);
    setStartedAtMs(Date.now());
    notified45Ref.current = false;
    startMutation.mutate({
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      taskId: selectedTask.id,
      taskName: selectedTask.name,
    });
  }, [selectedTask, selectedProject, startMutation, toast]);

  const handleStop = useCallback(() => {
    if (!activeSessionId) {
      if (startMutation.isPending) {
        pendingStopRef.current = true;
        setIsRunning(false);
        clearInterval(intervalRef.current!);
        setElapsed(0);
        setStartedAtMs(null);
      }
      return;
    }
    setIsRunning(false);
    clearInterval(intervalRef.current!);
    stopMutation.mutate(activeSessionId);
    setActiveSessionId(null);
    setElapsed(0);
    setStartedAtMs(null);
  }, [activeSessionId, startMutation.isPending, stopMutation]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    clearInterval(intervalRef.current!);
    setElapsed(0);
    if (activeSessionId) {
      stopMutation.mutate(activeSessionId);
    } else if (startMutation.isPending) {
      pendingStopRef.current = true;
    }
    setActiveSessionId(null);
    setStartedAtMs(null);
  }, [activeSessionId, startMutation.isPending, stopMutation]);

  useEffect(() => {
    if (isRunning && startedAtMs) {
      const tick = () => {
        const next = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
        setElapsed(next);
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(intervalRef.current!);
    }
    return () => clearInterval(intervalRef.current!);
  }, [isRunning, startedAtMs]);

  useEffect(() => {
    if (!isRunning || !reminderEnabled) return;
    if (elapsed >= STOPWATCH_NOTIFY_MINS * 60 && !notified45Ref.current) {
      notified45Ref.current = true;
      notifyUser("Time to relax", `You've been focused for ${STOPWATCH_NOTIFY_MINS} minutes.`);
      playBeep();
      toast({ title: "Time for a break", description: `You've studied for ${STOPWATCH_NOTIFY_MINS} mins.` });
    }
  }, [elapsed, isRunning, reminderEnabled, toast]);

  // ── Pomodoro controls ─────────────────────────────────────────────────────
  const handlePomStart = useCallback(() => {
    if (!selectedTask || !selectedProject) {
      toast({ title: "Select a project and task first", variant: "destructive" });
      return;
    }
    requestNotificationPermission();
    pendingPomStopRef.current = false;
    setPomodoroRunning(true);
    setPomodoroEndAtMs(Date.now() + pomodoroRemaining * 1000);
    if (isWorkCycle && !activeSessionId) {
      startMutation.mutate({
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        taskId: selectedTask.id,
        taskName: selectedTask.name,
      });
    }
  }, [selectedTask, selectedProject, isWorkCycle, activeSessionId, pomodoroRemaining, startMutation, toast]);

  const handlePomStop = useCallback(() => {
    setPomodoroRunning(false);
    clearInterval(pomIntervalRef.current!);
    if (pomodoroEndAtMs) {
      const remaining = Math.max(0, Math.ceil((pomodoroEndAtMs - Date.now()) / 1000));
      setPomodoroRemaining(remaining);
    }
    setPomodoroEndAtMs(null);
    if (activeSessionId) {
      stopMutation.mutate(activeSessionId);
      setActiveSessionId(null);
    } else if (startMutation.isPending) {
      pendingPomStopRef.current = true;
    }
  }, [activeSessionId, pomodoroEndAtMs, startMutation.isPending, stopMutation]);

  const handlePomReset = useCallback(() => {
    setPomodoroRunning(false);
    clearInterval(pomIntervalRef.current!);
    setCycleIdx(0);
    setPomodoroRemaining(POMODORO_CYCLES[0].mins * 60);
    setPomodoroEndAtMs(null);
    if (activeSessionId) {
      stopMutation.mutate(activeSessionId);
      setActiveSessionId(null);
    } else if (startMutation.isPending) {
      pendingPomStopRef.current = true;
    }
  }, [activeSessionId, startMutation.isPending, stopMutation]);

  const advanceCycle = useCallback(() => {
    const nextIdx = (cycleIdx + 1) % POMODORO_CYCLES.length;
    const next = POMODORO_CYCLES[nextIdx];
    setCycleIdx(nextIdx);
    setPomodoroRemaining(next.mins * 60);
    setPomodoroEndAtMs(null);
    setPomodoroRunning(false);
    if (next.type === "work" && selectedTask && selectedProject) {
      setTimeout(() => {
        startMutation.mutate({
          projectId: selectedProject!.id,
          projectName: selectedProject!.name,
          taskId: selectedTask!.id,
          taskName: selectedTask!.name,
        });
        setPomodoroEndAtMs(Date.now() + next.mins * 60 * 1000);
        setPomodoroRunning(true);
      }, 800);
    }
    const label = next.type === "work" ? "Time to focus!" : next.mins === 5 ? "Short break - 5 mins" : "Long break - 10 mins";
    toast({ title: next.type === "work" ? "Focus time" : "Break time", description: label });
    notifyUser(next.type === "work" ? "Focus time" : "Break time", label);
    playBeep();
  }, [cycleIdx, selectedProject, selectedTask, startMutation, toast]);

  useEffect(() => {
    if (pomodoroRunning && pomodoroEndAtMs) {
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((pomodoroEndAtMs - Date.now()) / 1000));
        setPomodoroRemaining(remaining);
        if (remaining <= 0) {
          clearInterval(pomIntervalRef.current!);
          if (isWorkCycle && activeSessionId) {
            stopMutation.mutate(activeSessionId);
            setActiveSessionId(null);
          } else if (isWorkCycle && startMutation.isPending) {
            pendingPomStopRef.current = true;
          }
          advanceCycle();
        }
      };
      tick();
      pomIntervalRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(pomIntervalRef.current!);
    }
    return () => clearInterval(pomIntervalRef.current!);
  }, [pomodoroRunning, pomodoroEndAtMs, isWorkCycle, activeSessionId, advanceCycle, startMutation.isPending, stopMutation]);

  useEffect(() => {
    if (pomodoroRunning && !pomodoroEndAtMs) {
      setPomodoroEndAtMs(Date.now() + pomodoroRemaining * 1000);
    }
  }, [pomodoroRunning, pomodoroEndAtMs, pomodoroRemaining]);

  const pomProgress = pomodoroRemaining / (currentCycle.mins * 60);

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">Focus Timer</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your deep work, synced to Notion</p>
      </div>

      {/* Project Selector */}
      <div className="mb-4 relative">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
          Project
        </label>
        <button
          data-testid="project-selector"
          onClick={() => { setProjectOpen(o => !o); setTaskOpen(false); }}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all",
            "bg-card hover:bg-secondary border-border",
            selectedProject ? "text-foreground" : "text-muted-foreground",
            projectOpen && "ring-2 ring-primary/30 border-primary/50"
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {selectedProject?.name ?? "Search and select a project…"}
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform", projectOpen && "rotate-180")} />
        </button>

        {projectOpen && (
          <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  data-testid="project-search"
                  autoFocus
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  placeholder="Type to filter…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {projectsLoading ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">Loading projects…</div>
              ) : filteredProjects.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No projects found</div>
              ) : filteredProjects.map(p => (
                <button
                  key={p.id}
                  data-testid={`project-option-${p.id}`}
                  onClick={() => {
                    setSelectedProject(p);
                    setSelectedTask(null);
                    setProjectOpen(false);
                    setProjectSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-secondary transition-colors",
                    selectedProject?.id === p.id && "bg-primary/10 text-primary"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  <div className="flex items-center gap-2">
                    {p.priority && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        p.priority === "High" ? "bg-red-500/10 text-red-400" :
                        p.priority === "Medium" ? "bg-yellow-500/10 text-yellow-400" :
                        "bg-muted text-muted-foreground"
                      )}>{p.priority}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Task Selector */}
      <div className="mb-8 relative">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
          Task
        </label>
        <button
          data-testid="task-selector"
          onClick={() => { if (!selectedProject) return; setTaskOpen(o => !o); setProjectOpen(false); }}
          disabled={!selectedProject}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all",
            "bg-card border-border",
            !selectedProject ? "opacity-40 cursor-not-allowed" : "hover:bg-secondary",
            selectedTask ? "text-foreground" : "text-muted-foreground",
            taskOpen && "ring-2 ring-primary/30 border-primary/50"
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Zap className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {selectedTask?.name ?? (selectedProject ? "Search and select a task…" : "Select a project first")}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedTask?.timeSpentMins != null && selectedTask.timeSpentMins > 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                {Math.round(selectedTask.timeSpentMins)}m logged
              </span>
            )}
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", taskOpen && "rotate-180")} />
          </div>
        </button>

        {taskOpen && (
          <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  data-testid="task-search"
                  autoFocus
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  placeholder="Type to filter…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {tasksLoading ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">Loading tasks…</div>
              ) : filteredTasks.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No tasks found</div>
              ) : filteredTasks.map(t => (
                <button
                  key={t.id}
                  data-testid={`task-option-${t.id}`}
                  onClick={() => {
                    setSelectedTask(t);
                    setTaskOpen(false);
                    setTaskSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-secondary transition-colors",
                    selectedTask?.id === t.id && "bg-primary/10 text-primary"
                  )}
                >
                  <div>
                    <div className="font-medium">{t.name}</div>
                    {t.status && (
                      <div className="text-xs text-muted-foreground mt-0.5">{t.status}</div>
                    )}
                  </div>
                  {(t.timeSpentMins ?? 0) > 0 && (
                    <span className="text-xs font-mono text-muted-foreground ml-2">
                      {Math.round(t.timeSpentMins!)}m
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 mb-8 w-fit mx-auto">
        {(["stopwatch", "pomodoro"] as Mode[]).map(m => (
          <button
            key={m}
            data-testid={`mode-${m}`}
            onClick={() => {
              if (mode === "stopwatch") handleReset();
              if (mode === "pomodoro") handlePomStop();
              setMode(m);
            }}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize",
              mode === m
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "stopwatch" ? "Stopwatch" : "Pomodoro"}
          </button>
        ))}
      </div>

      {/* Timer display */}
      {mode === "stopwatch" ? (
        <div className={cn(
          "flex flex-col items-center gap-8 p-8 rounded-2xl border border-border bg-card transition-all",
          isRunning && "timer-running"
        )}>
          <div
            data-testid="stopwatch-display"
            className="timer-display text-foreground"
          >
            {formatTime(elapsed)}
          </div>

          <div className="flex items-center gap-3">
            {!isRunning ? (
              <button
                data-testid="btn-start"
                onClick={handleStart}
                disabled={startMutation.isPending}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            ) : (
              <button
                data-testid="btn-stop"
                onClick={handleStop}
                disabled={stopMutation.isPending}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:opacity-90 transition-all"
              >
                <Square className="w-4 h-4" />
                Stop & Save
              </button>
            )}
            <button
              data-testid="btn-reset"
              onClick={handleReset}
              className="p-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
              aria-label="Reset"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {isRunning && selectedTask && (
            <div className="text-sm text-muted-foreground text-center">
              Tracking <span className="text-foreground font-medium">{selectedTask.name}</span>
            </div>
          )}
        </div>
      ) : (
        /* ── Pomodoro ────────────────────────────────────── */
        <div className={cn(
          "flex flex-col items-center gap-6 p-8 rounded-2xl border border-border bg-card transition-all",
          pomodoroRunning && "timer-running"
        )}>
          {/* Cycle indicator */}
          <div className="flex items-center gap-2">
            {POMODORO_CYCLES.map((c, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  i === cycleIdx % POMODORO_CYCLES.length
                    ? c.type === "work"
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-success/15 border-success/30 text-success"
                    : i < cycleIdx % POMODORO_CYCLES.length
                      ? "bg-muted/50 border-border/50 text-muted-foreground/50 line-through"
                      : "bg-transparent border-border text-muted-foreground"
                )}
              >
                {c.type === "work" ? (
                  <><Zap className="w-3 h-3" /> {c.mins}m</>
                ) : (
                  <><Coffee className="w-3 h-3" /> {c.mins}m</>
                )}
              </div>
            ))}
          </div>

          {/* Ring + time */}
          <div className="relative flex items-center justify-center">
            <TimerRing progress={pomProgress} isWork={isWorkCycle} size={260} />
            <div className="absolute flex flex-col items-center">
              <span
                data-testid="pomodoro-display"
                className="timer-display text-foreground"
                style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}
              >
                {formatTime(pomodoroRemaining)}
              </span>
              <span className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">
                {currentCycle.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!pomodoroRunning ? (
              <button
                data-testid="btn-pom-start"
                onClick={handlePomStart}
                disabled={startMutation.isPending}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {pomodoroRemaining === currentCycle.mins * 60 ? "Start" : "Resume"}
              </button>
            ) : (
              <button
                data-testid="btn-pom-pause"
                onClick={handlePomStop}
                className="flex items-center gap-2 px-8 py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-secondary transition-all"
              >
                <Square className="w-4 h-4" />
                Pause
              </button>
            )}
            <button
              data-testid="btn-pom-reset"
              onClick={handlePomReset}
              className="p-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
              aria-label="Reset pomodoro"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {pomodoroRunning && selectedTask && (
            <div className="text-sm text-muted-foreground text-center">
              {isWorkCycle ? "🎯 Focusing on" : "☕ Break from"}{" "}
              <span className="text-foreground font-medium">{selectedTask.name}</span>
            </div>
          )}

          <div className="w-full pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
            <span>Cycle {Math.floor(cycleIdx / 4) + 1}</span>
            <span>Total today: {formatTime(Math.round(totalTodayMins * 60))}</span>
          </div>
        </div>
      )}

      {/* Today's sessions */}
      <TodaySessions />
    </div>
  );
}

function TodaySessions() {
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/sessions/today"],
    refetchInterval: 5000,
  });

  if (sessions.length === 0) return null;

  const totalMins = sessions
    .filter(s => s.durationMins != null)
    .reduce((sum, s) => sum + (s.durationMins ?? 0), 0);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Today's Sessions
        </h2>
        <span className="text-xs font-mono text-muted-foreground">
          {Math.floor(totalMins / 60)}h {Math.round(totalMins % 60)}m total
        </span>
      </div>
      <div className="flex flex-col gap-2" data-testid="today-sessions">
        {sessions.map(s => (
          <div
            key={s.id}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border text-sm"
          >
            <div>
              <div className="font-medium text-foreground truncate max-w-[200px]">{s.taskName}</div>
              <div className="text-xs text-muted-foreground">{s.projectName}</div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              {s.durationMins != null ? (
                <span className="font-mono text-sm text-foreground">
                  {s.durationMins >= 60
                    ? `${Math.floor(s.durationMins / 60)}h ${Math.round(s.durationMins % 60)}m`
                    : `${Math.round(s.durationMins)}m`}
                </span>
              ) : (
                <span className="text-xs text-primary animate-pulse">Running…</span>
              )}
              {s.syncedToNotion && (
                <div className="text-xs text-green-500 mt-0.5">Synced ✓</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
