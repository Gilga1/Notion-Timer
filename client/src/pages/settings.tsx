import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Settings, Check, X, ExternalLink, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const REMINDER_KEY = "focus-timer-stopwatch-reminder";

function readReminderEnabled() {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function writeReminderEnabled(value: boolean) {
  try {
    localStorage.setItem(REMINDER_KEY, value ? "true" : "false");
  } catch {}
}

export default function SettingsPage() {
  const { data: health } = useQuery<{ ok: boolean; notionConfigured: boolean }>({
    queryKey: ["/api/health"],
  });
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(() => readReminderEnabled());

  useEffect(() => {
    writeReminderEnabled(reminderEnabled);
  }, [reminderEnabled]);

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your Focus Timer setup</p>
      </div>

      {/* Connection status */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Connections</h2>
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.234-.887.7-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/>
            </svg>
            <div>
              <div className="text-sm font-medium text-foreground">Notion</div>
              <div className="text-xs text-muted-foreground">Projects & Tasks database</div>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            health?.notionConfigured
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-400"
          }`}>
            {health?.notionConfigured ? (
              <><Check className="w-3 h-3" /> Connected</>
            ) : (
              <><X className="w-3 h-3" /> Not configured</>
            )}
          </div>
        </div>
      </div>

      {/* Setup instructions */}
      {!health?.notionConfigured && (
        <div className="bg-card border border-amber-500/20 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <h2 className="text-sm font-semibold text-foreground">Setup Required</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            To sync your focus time back to Notion, you need to provide a Notion API token. The app already
            knows your database IDs (Projects & Tasks from your Second Brain).
          </p>
          <ol className="flex flex-col gap-3 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary font-semibold">1.</span>
              Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 inline-flex items-center gap-1">
                notion.so/my-integrations <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li className="flex gap-2"><span className="text-primary font-semibold">2.</span>
              Create a new integration, copy the <strong className="text-foreground">Internal Integration Token</strong>
            </li>
            <li className="flex gap-2"><span className="text-primary font-semibold">3.</span>
              Share your Projects and Tasks databases with the integration (open each in Notion → ⋯ → Add connections)
            </li>
            <li className="flex gap-2"><span className="text-primary font-semibold">4.</span>
              Set <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono text-foreground">NOTION_TOKEN=secret_xxx</code> in
              your environment and restart the server
            </li>
          </ol>
        </div>
      )}

      {/* Reminder toggle */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Reminders</h2>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-foreground">45-minute reminder (Stopwatch)</div>
            <div className="text-xs text-muted-foreground">
              Sends a browser notification and a short beep after 45 minutes of focus.
            </div>
          </div>
          <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
        </div>
      </div>

      {/* Pomodoro config info */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Pomodoro Schedule</h2>
        <div className="flex flex-col gap-2">
          {[
            { emoji: "🎯", label: "Focus block 1", val: "45 minutes" },
            { emoji: "☕", label: "Short break", val: "5 minutes" },
            { emoji: "🎯", label: "Focus block 2", val: "45 minutes" },
            { emoji: "🌴", label: "Long break", val: "10 minutes" },
          ].map(({ emoji, label, val }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
              <span className="text-foreground">{emoji} {label}</span>
              <span className="font-mono text-muted-foreground">{val}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          The cycle repeats continuously. Each focus block automatically creates a Notion time entry when started and saves when the block ends or you manually stop.
        </p>
      </div>
    </div>
  );
}
