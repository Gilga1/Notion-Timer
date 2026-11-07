import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import TimerPage from "@/pages/timer";
import DashboardPage from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import RewardsPage from "@/pages/rewards";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/Sidebar";
import MealsPage from "@/pages/meals";
import TodayPage from "@/pages/today";

const THEME_KEY = "focus-timer-theme";
const SIDEBAR_KEY = "focus-timer-sidebar-collapsed";

function readStoredTheme(): "light" | "dark" {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}

function AppShell() {
  const [theme, setTheme] = useState<"light" | "dark">(() => readStoredTheme());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    readSidebarCollapsed(),
  );
  const [timerFocus, setTimerFocus] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "true" : "false");
    } catch {}
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setTimerFocus(!!detail?.active);
    };
    window.addEventListener("focus-timer-mode", onFocus as EventListener);
    return () =>
      window.removeEventListener("focus-timer-mode", onFocus as EventListener);
  }, []);

  return (
    <div className="flex h-screen w-full min-w-0 overflow-hidden bg-background text-foreground">
      <Sidebar
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        hidden={timerFocus}
      />
      <main
        className={cn(
          "flex-1 min-w-0 w-full overflow-x-hidden overflow-y-auto transition-all duration-300",
          timerFocus && "overflow-hidden",
        )}
      >
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/timer" component={TimerPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/rewards" component={RewardsPage} />
          <Route path="/meals" component={MealsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppShell />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
