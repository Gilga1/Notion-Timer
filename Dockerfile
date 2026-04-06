# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all deps (including devDeps for build)
COPY package.json package-lock.json ./
RUN npm ci

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
RUN npm ci --omit=dev

# Data directory for the session JSON log (mount a volume here to persist data)
RUN mkdir -p /app/data
ENV SESSION_DB_PATH=/app/data/focus-timer.db.json

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "dist/index.cjs"]
