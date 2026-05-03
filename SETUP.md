# ─────────────────────────────────────────────────────────────────────────────
# docker-compose.yml  (replace your existing one)
# ─────────────────────────────────────────────────────────────────────────────
services:
  focus-timer:
    build: .
    ports:
      - "5000:5000"
    env_file:
      - .env
    environment:
      PORT:             "5000"
      SESSION_DB_PATH:  "/app/data/focus-timer.db.json"
      REWARDS_DB_PATH:  "/app/data/rewards.db.json"
      PUSH_SUBS_PATH:   "/app/data/push-subscriptions.json"
      TZ:               "Asia/Kolkata"          # ← new: ensures node-cron fires at correct IST times
    volumes:
      - focus-timer-data:/app/data
    restart: unless-stopped

volumes:
  focus-timer-data:


# ─────────────────────────────────────────────────────────────────────────────
# .env.example  (copy to .env and fill in values)
# ─────────────────────────────────────────────────────────────────────────────

# ── Notion ────────────────────────────────────────────────────────────────────
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HABITS_DS=bd13c6c6-ca63-4ac6-8d55-75ac013b278b
PROJECTS_DS=your-projects-database-id-here
TASKS_DS=your-tasks-database-id-here

# ── OpenAI ────────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Push notifications (Web Push / VAPID) ────────────────────────────────────
# Generate once:  npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@gmail.com

# ── Base URL ──────────────────────────────────────────────────────────────────
# Home only:     http://192.168.1.x:5000   (replace x with your machine's local IP)
# Outside home:  https://your-machine.tail12345.ts.net  (Tailscale URL — see below)
# Push notifications and NFC require HTTPS → use Tailscale URL for full functionality
BASE_URL=http://192.168.1.x:5000

# ── Optional: Tavily web search (for richer reward suggestions) ───────────────
TAVILY_API_KEY=
TAVILY_ENDPOINT=https://api.tavily.com/v1/search


# ─────────────────────────────────────────────────────────────────────────────
# Changes to server/routes.ts  (add 4 import lines + 4 register calls)
# ─────────────────────────────────────────────────────────────────────────────
#
# At the top of server/routes.ts, add:
#
#   import { registerHabitRoutes }    from "./habitRoutes";
#   import { registerMealRoutes }     from "./mealRoutes";
#   import { registerPushRoutes }     from "./pushRoutes";
#   import { registerAnalyticsRoutes } from "./analyticsRoutes";
#
# At the END of the registerRoutes() function body, add:
#
#   registerHabitRoutes(app);
#   registerMealRoutes(app);
#   registerPushRoutes(app);
#   registerAnalyticsRoutes(app);
#   // existing line already there:
#   registerRewardRoutes(app);


# ─────────────────────────────────────────────────────────────────────────────
# Changes to server/index.ts  (add scheduler startup)
# ─────────────────────────────────────────────────────────────────────────────
#
# Add import at top:
#   import { startScheduler } from "./scheduler";
#
# After "await registerRoutes(httpServer, app);" add:
#   startScheduler();


# ─────────────────────────────────────────────────────────────────────────────
# New npm dependencies to install
# ─────────────────────────────────────────────────────────────────────────────
#
#   npm install web-push node-cron
#   npm install --save-dev @types/web-push @types/node-cron
#
# Then rebuild Docker:
#   docker compose down && docker compose build && docker compose up -d


# ─────────────────────────────────────────────────────────────────────────────
# Tailscale setup (for outside-home access + HTTPS push notifications)
# ─────────────────────────────────────────────────────────────────────────────
#
# 1. Install Tailscale on the machine running Docker:
#      Linux:  curl -fsSL https://tailscale.com/install.sh | sh
#      macOS:  brew install tailscale
#
# 2. Start and authenticate:
#      sudo tailscale up
#
# 3. Enable HTTPS (Tailscale provides a free TLS cert):
#      sudo tailscale serve https:5000 / http://localhost:5000
#      tailscale cert your-machine.tail12345.ts.net
#
# 4. Your BASE_URL becomes:
#      https://your-machine.tail12345.ts.net
#
# 5. Install Tailscale app on your OnePlus 15R — you're now on the same network
#    anywhere in the world. NFC tags and push notifications both work over HTTPS.
#
# Free tier: unlimited devices, unlimited bandwidth, 1 user. Perfect for this.


# ─────────────────────────────────────────────────────────────────────────────
# NFC tag setup on OnePlus 15R (Android)
# ─────────────────────────────────────────────────────────────────────────────
#
# Apps needed (both free):
#   1. "NFC Tools" by wakdev  (Play Store)
#   2. No other app needed — the URL on the tag opens directly in Chrome
#
# Steps per tag:
#   1. Open NFC Tools → Write → Add a record → URL
#   2. Enter:  https://your-tailscale-url/api/nfc/thyroid-med
#      (or the local URL if only using at home)
#   3. Tap the NFC sticker to write
#   4. Done — tapping that sticker with your phone opens a confirmation page
#      and checks the habit in Notion. No app needs to be open.
#
# Tag placement guide:
#   thyroid-med    → stick on medicine box lid
#   morning-meds   → stick on bathroom mirror (eye level)
#   spine-mobility → stick on yoga mat or foam roller
#   gym            → stick on gym bag zipper
#   isabgol        → stick on the isabgol jar
#   journal        → stick on desk/laptop lid
#   fat-burner-am  → stick on pre-workout snack drawer
#   fat-burner-pm  → stick beside the isabgol jar
#
# All NFC URLs are listed in the Settings screen of the app (/settings)
# with QR codes you can scan to write to tags without typing the URL.


# ─────────────────────────────────────────────────────────────────────────────
# Service Worker (required for background push notifications)
# ─────────────────────────────────────────────────────────────────────────────
#
# Create this file at:  client/public/sw.js
# (The full service worker code is in sw.js — see next output file)
#
# Register it in client/src/main.tsx:
#
#   if ('serviceWorker' in navigator) {
#     window.addEventListener('load', () => {
#       navigator.serviceWorker.register('/sw.js').then(reg => {
#         console.log('SW registered:', reg.scope);
#       });
#     });
#   }
