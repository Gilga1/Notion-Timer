import { Client } from "@notionhq/client";

const HABITS_DS =
  process.env.HABITS_DS || "bd13c6c6-ca63-4ac6-8d55-75ac013b278b";

// Habits we track streaks for (matches your Notion schema exactly)
export const TRACKED_HABITS = [
  "Coding",
  "Upskill",
  "Journal",
  "Eat Healthy",
  "Gym",
  "Reading",
  "Meds",
  "Skincare",
] as const;

export type HabitName = (typeof TRACKED_HABITS)[number];

// Composite streak definitions — groups that unlock special rewards
export const COMPOSITE_STREAKS = [
  {
    id: "upskilling",
    label: "Upskilling combo",
    habits: ["Coding", "Upskill"] as HabitName[],
    description: "Both Coding + Upskill done",
  },
  {
    id: "wellness",
    label: "Wellness trio",
    habits: ["Gym", "Eat Healthy", "Meds"] as HabitName[],
    description: "Gym + Eat Healthy + Meds done",
  },
  {
    id: "mind",
    label: "Mind stack",
    habits: ["Reading", "Journal"] as HabitName[],
    description: "Reading + Journal done",
  },
];

export interface HabitDay {
  date: string; // YYYY-MM-DD
  habits: Partial<Record<HabitName, boolean>>;
  habitsCompletedCount: number;
}

export interface StreakData {
  habit: string;
  currentStreak: number;
  longestStreak: number;
  lastChecked: string; // YYYY-MM-DD
  isComposite: boolean;
}

function getDateStr(isoStr: string): string {
  // Returns YYYY-MM-DD in Asia/Kolkata
  const dt = new Date(isoStr);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function addDays(dateStr: string, n: number): string {
  // Date-only arithmetic; avoid timezone drift from toISOString().
  const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function computeStreak(dates: Set<string>): {
  current: number;
  longest: number;
} {
  if (dates.size === 0) return { current: 0, longest: 0 };

  const sorted = Array.from(dates).sort();
  let longest = 1,
    currentRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1], 1) === sorted[i]) {
      currentRun++;
      longest = Math.max(longest, currentRun);
    } else {
      currentRun = 1;
    }
  }

  // Current streak = count backwards from today
  const todayStr = getDateStr(new Date().toISOString());
  const yesterdayStr = addDays(todayStr, -1);
  let current = 0;
  let checkDate = dates.has(todayStr)
    ? todayStr
    : dates.has(yesterdayStr)
      ? yesterdayStr
      : null;
  if (checkDate) {
    while (dates.has(checkDate!)) {
      current++;
      checkDate = addDays(checkDate!, -1);
    }
  }
  return { current, longest };
}

export async function fetchHabitStreaks(): Promise<StreakData[]> {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  // Fetch last 90 days of habit data
  const since = addDays(getDateStr(new Date().toISOString()), -90);

  let results: any[] = [];
  let cursor: string | undefined;

  do {
    const queryPayload: any = {
      filter: {
        property: "Date",
        date: { on_or_after: since },
      },
      sorts: [{ property: "Date", direction: "ascending" }],
      page_size: 100,
    };
    if (cursor) queryPayload.start_cursor = cursor;

    let resp: any;
    try {
      // Prefer the dataSources API if available (enterprise-style data sources)
      if (
        (notion as any).dataSources &&
        typeof (notion as any).dataSources.query === "function"
      ) {
        resp = await (notion as any).dataSources.query({
          data_source_id: HABITS_DS,
          ...queryPayload,
        });
      } else {
        // Fallbacks: try the high-level databases.query if present, otherwise
        // use the generic request() to POST to the databases endpoint. This
        // protects against SDK shape differences across versions.
        if (
          (notion as any).databases &&
          typeof (notion as any).databases.query === "function"
        ) {
          resp = await (notion as any).databases.query({
            database_id: HABITS_DS,
            ...queryPayload,
          });
        } else {
          resp = await (notion as any).request({
            path: `/databases/${HABITS_DS}/query`,
            method: "post",
            body: queryPayload,
          });
        }
      }
    } catch (err: any) {
      // Provide a clearer error message for the common 'object_not_found'
      // case where the database ID isn't correct or the integration hasn't
      // been granted access to the database.
      if (err && err.code === "object_not_found") {
        const msg = `Could not find database with ID ${HABITS_DS}. Ensure the ID is correct and the Notion integration 'focus-timer' has access to that database.`;
        console.error("habits/streaks error:", msg, err);
        throw new Error(msg);
      }
      console.error("habits/streaks error:", err?.message ?? err);
      throw err;
    }

    results = results.concat(resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  // Build per-day data
  const days: HabitDay[] = results.map((page: any) => {
    const dateRaw =
      page.properties?.Date?.date?.start ??
      page.properties?.["date:Date:start"];
    const date = dateRaw ? getDateStr(dateRaw) : "";
    const habits: Partial<Record<HabitName, boolean>> = {};
    for (const h of TRACKED_HABITS) {
      const val = page.properties?.[h];
      if (val?.type === "checkbox") habits[h] = val.checkbox === true;
    }
    const habitsCompletedCount = Object.values(habits).filter(Boolean).length;
    return { date, habits, habitsCompletedCount };
  });

  const streaks: StreakData[] = [];

  // Individual habit streaks
  for (const habit of TRACKED_HABITS) {
    const doneDates = new Set(
      days.filter((d) => d.habits[habit] === true).map((d) => d.date),
    );
    const { current, longest } = computeStreak(doneDates);
    streaks.push({
      habit,
      currentStreak: current,
      longestStreak: longest,
      lastChecked: getDateStr(new Date().toISOString()),
      isComposite: false,
    });
  }

  // Composite streaks
  for (const combo of COMPOSITE_STREAKS) {
    const doneDates = new Set(
      days
        .filter((d) => combo.habits.every((h) => d.habits[h] === true))
        .map((d) => d.date),
    );
    const { current, longest } = computeStreak(doneDates);
    streaks.push({
      habit: combo.id,
      currentStreak: current,
      longestStreak: longest,
      lastChecked: getDateStr(new Date().toISOString()),
      isComposite: true,
    });
  }

  return streaks;
}
