import { Link, useLocation } from "wouter";
import {
  Timer,
  BarChart3,
  Settings,
  Gift,
  Sun,
  Moon,
  Utensils,
  CalendarCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  hidden?: boolean;
}

const NAV = [
  { href: "/", icon: CalendarCheck, label: "Today" },
  { href: "/timer", icon: Timer, label: "Focus Timer" },
  { href: "/dashboard", icon: BarChart3, label: "Dashboard" },
  { href: "/meals", icon: Utensils, label: "Meals" },
  { href: "/rewards", icon: Gift, label: "Rewards" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar({
  theme,
  onThemeToggle,
  collapsed,
  onCollapsedChange,
  hidden = false,
}: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      data-testid="sidebar"
      aria-hidden={hidden}
      className={cn(
        "h-screen flex flex-col border-r border-border bg-card flex-shrink-0 overflow-hidden",
        "transition-[width,opacity,transform,margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-16" : "w-16 md:w-56",
        hidden &&
          "w-0 border-0 opacity-0 -translate-x-2 pointer-events-none m-0",
      )}
    >
      {/* Logo + collapse */}
      <div
        className={cn(
          "h-14 flex items-center border-b border-border",
          collapsed ? "justify-center px-2" : "justify-between gap-1 px-3",
        )}
      >
        {!collapsed && (
          <div className="flex items-center min-w-0">
            <svg
              aria-label="Focus Timer"
              viewBox="0 0 32 32"
              fill="none"
              className="w-7 h-7 flex-shrink-0"
            >
              <circle
                cx="16"
                cy="16"
                r="13"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
              />
              <circle
                cx="16"
                cy="16"
                r="8"
                fill="hsl(var(--primary))"
                fillOpacity="0.12"
              />
              <line
                x1="16"
                y1="16"
                x2="16"
                y2="8"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="16"
                y1="16"
                x2="21"
                y2="19"
                stroke="hsl(var(--foreground))"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="16" cy="16" r="1.5" fill="hsl(var(--primary))" />
            </svg>
            <span className="hidden md:block ml-3 font-semibold text-sm tracking-tight text-foreground whitespace-nowrap">
              Focus Timer
            </span>
          </div>
        )}
        <button
          type="button"
          data-testid="sidebar-toggle"
          onClick={() => onCollapsedChange(!collapsed)}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors flex-shrink-0"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
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
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                collapsed && "justify-center px-0",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span
                className={cn(
                  "whitespace-nowrap",
                  collapsed ? "hidden" : "hidden md:block",
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onThemeToggle}
          data-testid="theme-toggle"
          title={
            collapsed
              ? theme === "dark"
                ? "Light mode"
                : "Dark mode"
              : undefined
          }
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-all",
            collapsed && "justify-center px-0",
          )}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Moon className="w-4 h-4 flex-shrink-0" />
          )}
          <span
            className={cn(
              "whitespace-nowrap",
              collapsed ? "hidden" : "hidden md:block",
            )}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </button>
      </div>
    </aside>
  );
}
