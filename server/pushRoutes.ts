/**
 * server/pushRoutes.ts
 *
 * Web Push + VAPID subscription management.
 *
 * Endpoints:
 *   GET  /api/push/vapid-public-key  — returns public VAPID key for frontend subscription
 *   POST /api/push/subscribe         — save a push subscription from the browser
 *   DELETE /api/push/unsubscribe     — remove a subscription
 *   POST /api/push/test              — send a test notification immediately
 *
 * Setup:
 *   1. npm install web-push
 *   2. Generate VAPID keys once:
 *        npx web-push generate-vapid-keys
 *   3. Add to .env:
 *        VAPID_PUBLIC_KEY=<from above>
 *        VAPID_PRIVATE_KEY=<from above>
 *        VAPID_SUBJECT=mailto:you@example.com
 *        BASE_URL=https://your-tailscale-hostname.ts.net (or http://192.168.x.x:5000 for local)
 *
 * Add to server/routes.ts registerRoutes():
 *   import { registerPushRoutes } from "./pushRoutes";
 *   registerPushRoutes(app);
 */

import type { Express } from "express";
import fs from "fs";
import path from "path";
import webpush from "web-push";

const SUBS_PATH =
  process.env.PUSH_SUBS_PATH ?? path.resolve("push-subscriptions.json");

// ── VAPID setup ───────────────────────────────────────────────────────────────

function initVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT ?? "mailto:admin@localhost";

  if (!pub || !priv) {
    console.warn(
      "[push] VAPID keys not set. Push notifications disabled.\n" +
        "  Run: npx web-push generate-vapid-keys\n" +
        "  Then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env",
    );
    return false;
  }

  webpush.setVapidDetails(subj, pub, priv);
  return true;
}

const vapidReady = initVapid();

// ── Subscription store (JSON file) ────────────────────────────────────────────

interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  addedAt: string;
  label?: string; // e.g. "OnePlus 15R"
}

function loadSubs(): PushSub[] {
  try {
    if (fs.existsSync(SUBS_PATH)) {
      return JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
    }
  } catch {}
  return [];
}

function saveSubs(subs: PushSub[]) {
  fs.writeFileSync(SUBS_PATH, JSON.stringify(subs, null, 2));
}

// ── Send helper ───────────────────────────────────────────────────────────────

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string; // collapses duplicate notifications with same tag
}): Promise<{ sent: number; failed: number }> {
  if (!vapidReady) return { sent: 0, failed: 0 };

  const subs = loadSubs();
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const base = process.env.BASE_URL ?? "";
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? `${base}/icon-192.png`,
    url: payload.url ?? base,
    tag: payload.tag ?? payload.title,
  });

  let sent = 0,
    failed = 0;
  const toRemove: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          data,
          { TTL: 60 * 60 }, // 1 hour TTL — notification expires if phone is offline
        );
        sent++;
      } catch (e: any) {
        // 410 Gone = subscription expired/unregistered, remove it
        if (e.statusCode === 410 || e.statusCode === 404) {
          toRemove.push(sub.endpoint);
        }
        failed++;
        console.error(`[push] send failed (${e.statusCode}):`, e.message);
      }
    }),
  );

  // Clean up expired subscriptions
  if (toRemove.length > 0) {
    const cleaned = subs.filter((s) => !toRemove.includes(s.endpoint));
    saveSubs(cleaned);
  }

  return { sent, failed };
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerPushRoutes(app: Express) {
  // GET /api/push/vapid-public-key
  app.get("/api/push/vapid-public-key", (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: "VAPID not configured" });
    res.json({ key });
  });

  // POST /api/push/subscribe
  // Body: { endpoint, keys: { p256dh, auth }, label? }
  app.post("/api/push/subscribe", (req, res) => {
    const { endpoint, keys, label } = req.body as PushSub & { label?: string };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription object" });
    }

    const subs = loadSubs();
    const exists = subs.find((s) => s.endpoint === endpoint);

    if (!exists) {
      subs.push({ endpoint, keys, addedAt: new Date().toISOString(), label });
      saveSubs(subs);
      console.log(
        `[push] New subscription registered${label ? ` (${label})` : ""}`,
      );
    }

    res.json({ ok: true, total: subs.length });
  });

  // DELETE /api/push/unsubscribe
  // Body: { endpoint }
  app.delete("/api/push/unsubscribe", (req, res) => {
    const { endpoint } = req.body as { endpoint: string };
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    const subs = loadSubs();
    const after = subs.filter((s) => s.endpoint !== endpoint);
    saveSubs(after);

    res.json({ ok: true, removed: subs.length - after.length });
  });

  // POST /api/push/test — fire a test notification immediately
  app.post("/api/push/test", async (_req, res) => {
    const result = await sendPushToAll({
      title: "Focus Timer",
      body: "Push notifications are working!",
      tag: "test",
    });
    res.json(result);
  });

  // GET /api/push/status
  app.get("/api/push/status", (_req, res) => {
    const subs = loadSubs();
    res.json({
      vapidConfigured: vapidReady,
      subscriptions: subs.length,
      baseUrl: process.env.BASE_URL ?? null,
    });
  });
}
