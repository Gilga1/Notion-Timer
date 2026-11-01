/**
 * server/scheduler.ts
 *
 * Cron-based push notification scheduler for all daily reminders + monthly bill alerts.
 * All times are in Asia/Kolkata (IST).
 *
 * Setup:
 *   1. npm install node-cron
 *   2. Import and call startScheduler() once in server/index.ts after routes are registered.
 *
 * Add to server/index.ts:
 *   import { startScheduler } from "./scheduler";
 *   // after registerRoutes():
 *   startScheduler();
 */

import cron from "node-cron";
import { sendPushToAll } from "./pushRoutes";

// node-cron uses: second(optional) minute hour day-of-month month day-of-week
// All schedules are in the system timezone, so we set TZ=Asia/Kolkata in docker-compose.

// ── Daily reminders ───────────────────────────────────────────────────────────

const DAILY_REMINDERS = [
  {
    // 7:30 AM — thyroid pill
    cron: "0 30 7 * * *",
    title: "💊 Thyroid Pill",
    body: "Take it NOW — empty stomach. Don't eat for 45 min.",
    tag: "thyroid",
    url: "/api/nfc/thyroid-med",
  },
  {
    // 8:15 AM — breakfast + meds batch
    cron: "0 15 8 * * *",
    title: "🍳 Breakfast time",
    body: "Eat now + take BP med, Vitamin E, Ashwagandha.",
    tag: "morning-meds",
    url: "/",
  },
  {
    // 11:00 AM — gym
    cron: "0 0 11 * * *",
    title: "🏋️ Gym time",
    body: "45–60 min session. Take Fat Burner AM with pre-gym snack.",
    tag: "gym",
    url: "/api/nfc/gym",
  },
  {
    // 12:00 PM — journal + log lunch macros before office
    cron: "0 0 12 * * *",
    title: "📓 Journal + macros",
    body: "Log lunch, write journal — do it now before leaving.",
    tag: "journal",
    url: "/meal",
  },
  {
    // 1:00 PM — commute prep
    cron: "0 0 13 * * *",
    title: "🏢 Office in 1 hour",
    body: "Skincare, topicals, pack bag. Leave on time.",
    tag: "commute",
    url: "/",
  },
  {
    // 7:00 PM — dinner at office + log macros
    cron: "0 0 19 * * *",
    title: "🍽️ Dinner time",
    body: "Log dinner macros — check your daily calorie total.",
    tag: "dinner",
    url: "/meal",
  },
  {
    // 11:30 PM — isabgol + fat burner PM
    cron: "0 30 23 * * *",
    title: "🌙 Wind-down",
    body: "Fat Burner PM + 2 tbsp isabgol in lukewarm water. Sleep by 12.",
    tag: "wind-down",
    url: "/api/nfc/isabgol",
  },
];

// ── Monthly bill reminders ────────────────────────────────────────────────────
// Fire at 9 AM on reminder day

const MONTHLY_REMINDERS = [
  {
    // 19th of every month — SBI LIC premium due tomorrow
    cron: "0 0 9 19 * *",
    title: "SBI LIC Premium",
    body: "SBI LIC premium due tomorrow (20th). Pay today.",
    tag: "lic-premium",
  },
  {
    // 22nd of every month — Amex bill just generated
    cron: "0 0 9 22 * *",
    title: "Amex Bill Generated",
    body: "Amex statement generated today. Pay within 5 days.",
    tag: "amex",
  },
  {
    // 27th — final Amex reminder (in case it wasn't paid)
    cron: "0 0 9 27 * *",
    title: "Amex — Last Reminder",
    body: "Amex bill due in ~2 days. Pay now to avoid interest.",
    tag: "amex-final",
  },
];

/** True when tomorrow (IST) is the 1st — works for Feb/short months. */
function isLastDayOfMonthIST(): boolean {
  const tomorrow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  const base = process.env.BASE_URL ?? "";

  // Register daily reminders
  for (const reminder of DAILY_REMINDERS) {
    cron.schedule(
      reminder.cron,
      async () => {
        console.log(`[scheduler] Firing: ${reminder.title}`);
        const result = await sendPushToAll({
          title: reminder.title,
          body: reminder.body,
          tag: reminder.tag,
          url: reminder.url ? `${base}${reminder.url}` : base,
        });
        console.log(
          `[scheduler] ${reminder.title}: sent=${result.sent} failed=${result.failed}`,
        );
      },
      {
        timezone: "Asia/Kolkata",
      },
    );
  }

  // Last calendar day of month (IST) — bill day tomorrow
  cron.schedule(
    "0 0 9 * * *",
    async () => {
      if (!isLastDayOfMonthIST()) return;
      console.log("[scheduler] Monthly: Bill day tomorrow");
      const result = await sendPushToAll({
        title: "Bill day tomorrow",
        body: "Pay ICICI, Axis, HDFC credit cards + rent transfer by 1st.",
        tag: "bills-1st",
        url: base,
      });
      console.log(
        `[scheduler] Bill day tomorrow: sent=${result.sent} failed=${result.failed}`,
      );
    },
    { timezone: "Asia/Kolkata" },
  );

  // Register monthly reminders
  for (const reminder of MONTHLY_REMINDERS) {
    cron.schedule(
      reminder.cron,
      async () => {
        console.log(`[scheduler] Monthly: ${reminder.title}`);
        const result = await sendPushToAll({
          title: reminder.title,
          body: reminder.body,
          tag: reminder.tag,
          url: base,
        });
        console.log(
          `[scheduler] ${reminder.title}: sent=${result.sent} failed=${result.failed}`,
        );
      },
      {
        timezone: "Asia/Kolkata",
      },
    );
  }

  console.log(
    `[scheduler] Started — ${DAILY_REMINDERS.length} daily + ${MONTHLY_REMINDERS.length + 1} monthly reminders active (IST)`,
  );
}
