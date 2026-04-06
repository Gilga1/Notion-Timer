import { Link, useLocation } from "wouter";
import { Timer, BarChart3, Settings, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

const NAV = [
  { href: "/", icon: Timer, label: "Focus Timer" },
  { href: "/dashboard", icon: BarChart3, label: "Dashboard" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({ theme, onThemeToggle }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      data-testid="sidebar"
      className="w-16 md:w-56 flex-shrink-0 h-screen flex flex-col border-r border-border bg-card"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <svg
          aria-label="Focus Timer"
          viewBox="0 0 32 32"
          fill="none"
          className="w-7 h-7 flex-shrink-0"
        >
          <circle cx="16" cy="16" r="13" stroke="hsl(var(--primary))" strokeWidth="2" />
          <circle cx="16" cy="16" r="8" fill="hsl(var(--primary))" fillOpacity="0.12" />
          <line x1="16" y1="16" x2="16" y2="8" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="16" x2="21" y2="19" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="16" cy="16" r="1.5" fill="hsl(var(--primary))" />
        </svg>
        <span className="hidden md:block ml-3 font-semibold text-sm tracking-tight text-foreground">
          Focus Timer
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onThemeToggle}
          data-testid="theme-toggle"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          <span className="hidden md:block">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
      </div>
    </aside>
  );
}
