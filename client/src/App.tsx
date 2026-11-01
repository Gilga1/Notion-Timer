import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState } from "react";
import TimerPage from "@/pages/timer";
import DashboardPage from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import RewardsPage from "@/pages/rewards";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/Sidebar";
import MealsPage from "@/pages/meals";
import TodayPage from "@/pages/today";

const THEME_KEY = "focus-timer-theme";

function readStoredTheme(): "light" | "dark" {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function AppShell() {
  const [theme, setTheme] = useState<"light" | "dark">(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <main className="flex-1 overflow-y-auto">
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
