# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all deps (including devDeps for build)
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/dist ./dist

# Install only production dependencies (no devDeps)
RUN npm install --omit=dev --no-audit --no-fund

# Data directory for JSON DBs (mount a volume here to persist data)
RUN mkdir -p /app/data
ENV SESSION_DB_PATH=/app/data/focus-timer.db.json
ENV REWARDS_DB_PATH=/app/data/rewards.db.json
ENV MEALS_DB_PATH=/app/data/meals.db.json
ENV PUSH_SUBS_PATH=/app/data/push-subscriptions.json

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "dist/index.cjs"]
