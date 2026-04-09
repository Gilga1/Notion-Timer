import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { URLSearchParams } from "url";

const DB_PATH = process.env.REWARDS_DB_PATH ?? path.resolve("rewards.db.json");

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type RewardStatus = "unlocked" | "claimed" | "expired";
export type RewardCategory =
  | "food"
  | "movie"
  | "game"
  | "book"
  | "music"
  | "activity";

export interface Reward {
  id: string;
  habitKey: string; // e.g. "Coding", "upskilling"
  milestoneStreak: number; // the streak milestone that triggered this
  title: string;
  description: string;
  category: RewardCategory;
  emoji: string;
  why: string; // LLM's reasoning
  status: RewardStatus;
  unlockedAt: string; // ISO
  claimedAt?: string;
  expiresAt?: string;
}

// Milestones at which rewards are generated
export const STREAK_MILESTONES = [3, 7, 10, 14, 21, 30];

function normalizeHabitKey(habitKey: string) {
  return habitKey.trim().toLowerCase();
}

function allowedRewardCategoriesForHabit(habitKey: string): RewardCategory[] {
  const k = normalizeHabitKey(habitKey);

  // User-defined mapping:
  // 1) Eat Healthy / Gym -> food (pizza etc)
  // 2) Study / Coding / Upskill -> game | movie | book
  // 3) Skincare / Meds -> game | music | book
  if (k === "eat healthy" || k === "gym" || k === "wellness") return ["food"];

  if (
    k === "coding" ||
    k === "upskill" ||
    k === "upskilling" ||
    k === "study" ||
    k === "mind"
  ) {
    return ["game", "movie", "book"];
  }

  if (k === "skincare" || k === "meds") return ["game", "music", "book"];

  // Sensible defaults for other habits
  if (k === "reading") return ["book", "movie"];
  if (k === "journal") return ["book", "music"];

  return ["activity", "movie", "music", "book"];
}

function pickCategory(
  allowed: RewardCategory[],
  recentCategories: string[],
): RewardCategory {
  // Keep variety within the allowed set (avoid repeating the immediate last category when possible).
  const last = recentCategories[0] as RewardCategory | undefined;
  return allowed.find((c) => c !== last) ?? allowed[0];
}

// â”€â”€ Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function loadRewards(): Reward[] {
  try {
    if (fs.existsSync(DB_PATH))
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {}
  return [];
}

function saveRewards(rewards: Reward[]): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(rewards, null, 2));
}

// â”€â”€ LLM Reward Generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const USER_PROFILE = `
You are generating a personal reward for a software developer in Hyderabad, India.

Their interests and preferences:
- FOOD: Loves pizzas, burgers, Indian street food (pani puri, tikki chaat), chocolate desserts (Death by Chocolate, triple sundaes, anything chocolate)
- GAMING: Nintendo Switch (Zelda BOTW, Tears of the Kingdom), Skyrim
- MOVIES: Classic cinema with substance (Godfather, LOTR), intense thrillers (Dhurandhar), murder mysteries (Agatha Christie adaptations), HORROR (they especially love horror movies)
- MUSIC: Classical/instrumental â€” Vivaldi's Four Seasons, piano pieces, orchestral
- BOOKS: Harry Potter series, crime fiction, autobiographies, fantasy novels

When picking a reward:
- For food milestones (especially Eat Healthy habit â€” the irony is fun): recommend a specific indulgence item or restaurant dish type popular in Hyderabad or available on Zomato/Swiggy
- For gaming milestones: recommend a specific game, DLC, or gaming session idea
- For movies: search for a currently available or recently released movie matching their taste. Prioritise horror if streak is for any habit
- For books: recommend a specific book they haven't likely read, grounded in current availability
- For music: recommend a specific classical piece or album
  - VARY the category. Don't always pick food.
  - Make the reward feel personally earned and proportionate to the streak length. 3-day streak = small treat; 21-30 days = major celebration.

IMPORTANT: You MUST enforce strict category rotation. Track what the last 3 rewards generated were. Never pick the same category more than once in any 3 consecutive rewards. For a single-habit streak, pick categories in this weighted order based on habit type:
- Coding/Upskill streaks: game (40%), book (30%), activity (20%), food (10%)  
- Gym/Eat Healthy streaks: food (35%), activity (30%), music (20%), movie (15%)
- Reading/Journal streaks: book (40%), movie (35%), music (15%), food (10%)
- Skincare/Meds streaks: music (30%), activity (25%), movie (25%), food (20%)
- Composite streaks: movie (35%), game (25%), book (25%), food (15%)
Never pick food for 2 consecutive rewards regardless of category weighting.
`;

export async function generateReward(
  habitKey: string,
  habitLabel: string,
  streakDays: number,
  isComposite: boolean,
): Promise<Omit<Reward, "id" | "status" | "unlockedAt">> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Attempt a web search via Tavily if configured. We'll attach a short
  // summary of top results to the prompt to ground the LLM suggestions.
  async function webSearch(query: string): Promise<string> {
    const key = process.env.TAVILY_API_KEY;
    const endpoint = process.env.TAVILY_ENDPOINT; // e.g. https://api.tavily.com/v1/search
    if (!key || !endpoint) return "";

    try {
      const params = new URLSearchParams({ q: query });
      const url = `${endpoint}?${params.toString()}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      // Normalize a short text summary depending on response shape
      if (Array.isArray(data.results)) {
        return data.results
          .slice(0, 5)
          .map(
            (r: any, i: number) =>
              `${i + 1}. ${r.title ?? r.headline ?? r.snippet ?? r.url}`,
          )
          .join("\n");
      }
      if (data.items && Array.isArray(data.items)) {
        return data.items
          .slice(0, 5)
          .map(
            (r: any, i: number) => `${i + 1}. ${r.title ?? r.snippet ?? r.url}`,
          )
          .join("\n");
      }
      return JSON.stringify(data).slice(0, 1000);
    } catch (e) {
      return "";
    }
  }

  // Use history to vary categories within the user's mapping.
  let recentCategories: string[] = [];
  try {
    const saved = loadRewards();
    recentCategories = saved.slice(0, 5).map((r) => r.category);
  } catch {}

  const allowedCategories = allowedRewardCategoriesForHabit(habitKey);
  const forcedCategory = pickCategory(allowedCategories, recentCategories);
  const habitNorm = normalizeHabitKey(habitKey);
  const themeHint =
    forcedCategory === "food"
      ? habitNorm === "eat healthy" || habitNorm === "gym" || habitNorm === "wellness"
        ? "Make it specifically about eating pizza as the treat."
        : "Pick a specific indulgent food treat."
      : forcedCategory === "game"
        ? "Prefer Nintendo Switch game/session ideas."
        : forcedCategory === "movie"
          ? "Prefer a horror or thriller movie suggestion."
          : forcedCategory === "music"
            ? "Prefer an instrumental/classical piece or soundtrack."
            : "";

  // Enforce the user's requested mapping strictly for Eat Healthy/Gym -> pizza.
  if (
    forcedCategory === "food" &&
    (habitNorm === "eat healthy" || habitNorm === "gym" || habitNorm === "wellness")
  ) {
    return {
      habitKey,
      milestoneStreak: streakDays,
      title: `Pizza time (${streakDays} days)`,
      description: `You earned it - eat a pizza today to celebrate your ${streakDays}-day ${habitLabel} streak.`,
      category: "food",
      emoji: "🍕",
      why: `Eat Healthy/Gym streaks unlock a pizza treat by design.`,
    };
  }

  const basePrompt = `
 ${USER_PROFILE}

The user has just hit a ${streakDays}-day streak on: "${habitLabel}" (${isComposite ? "composite habit group" : "single habit"}).

 Generate a single, specific, personalised reward. If you can, ground the suggestion in real items the user might enjoy (movie, game, dessert, restaurant type). Use the web search results appended below to make the suggestion current and specific. If no web results are available, produce a plausible, personalised suggestion based on the user's profile.

 IMPORTANT CATEGORY RULE:
 - This reward's category is FIXED to: "${forcedCategory}".
 - The "category" field in your JSON MUST be exactly "${forcedCategory}".
 - Only suggest rewards that match this category.
 ${themeHint ? `\nExtra hint: ${themeHint}\n` : ""}

Respond ONLY with a JSON object (no markdown, no explanation) in this exact shape:
{
  "title": "short reward title",
  "description": "1-2 sentences describing the reward specifically â€” include real names (movie title, restaurant, book title etc)",
  "category": "food" | "movie" | "game" | "book" | "music" | "activity",
  "emoji": "single relevant emoji",
  "why": "1 sentence explaining why this reward fits this specific habit achievement"
}
 The category field is REQUIRED and must be one of: food, movie, game, book, music, activity.
  `;

  // Perform a targeted search based on habit and interests to ground suggestions
  const categorySearchHint =
    forcedCategory === "food"
      ? "pizza burger pani puri dessert Hyderabad"
      : forcedCategory === "game"
        ? "Nintendo Switch game recommendation"
        : forcedCategory === "movie"
          ? "recent horror thriller movie recommendation"
          : forcedCategory === "book"
            ? "book recommendation crime fantasy"
            : forcedCategory === "music"
              ? "classical instrumental album recommendation"
              : "fun activity idea Hyderabad";
  const searchQuery = `${categorySearchHint} ${habitLabel} ${streakDays} day reward`;
  const searchResults = await webSearch(searchQuery);

  const prompt = `${basePrompt}\n\nWeb search results:\n${searchResults}\n\n`;

  const promptWithHistory = `${prompt}Recent reward categories: ${recentCategories.join(", ")}`;

  // Wrap the LLM call so failures fall back to a simple, deterministic reward
  let textBlock = "";
  try {
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: promptWithHistory,
      max_output_tokens: 500,
    } as any);

    // Extract text from response (best-effort, SDK output shapes vary)
    if (Array.isArray((response as any).output)) {
      textBlock = (response as any).output
        .map((o: any) => {
          if (typeof o === "string") return o;
          if (o.type === "output_text" && o.text) return o.text;
          if (o.content)
            return o.content.map((c: any) => c.text || "").join("");
          return JSON.stringify(o);
        })
        .join("\n");
    } else if ((response as any).output_text) {
      textBlock = (response as any).output_text;
    } else if ((response as any).output?.[0]?.content?.[0]?.text) {
      textBlock = (response as any).output[0].content[0].text;
    } else if ((response as any).text) {
      textBlock = (response as any).text;
    }
  } catch (llmErr) {
    console.warn("LLM generation failed, using fallback reward:");
    const fallbackTitle =
      forcedCategory === "food"
        ? "Pizza reward"
        : forcedCategory === "game"
          ? "Nintendo break"
          : forcedCategory === "movie"
            ? "Movie night"
            : forcedCategory === "book"
              ? "Book pick"
              : forcedCategory === "music"
                ? "Soundtrack break"
                : "Mini celebration";
    const fallbackDescription =
      forcedCategory === "food"
        ? `Grab a pizza as a treat for your ${streakDays}-day ${habitLabel} streak.`
        : forcedCategory === "game"
          ? `Take a short Nintendo Switch gaming session to celebrate your ${streakDays}-day ${habitLabel} streak.`
          : forcedCategory === "movie"
            ? `Watch a horror/thriller movie to celebrate your ${streakDays}-day ${habitLabel} streak.`
            : forcedCategory === "book"
              ? `Pick a book to start (or continue) as a reward for your ${streakDays}-day ${habitLabel} streak.`
              : forcedCategory === "music"
                ? `Put on an instrumental soundtrack/classical piece to celebrate your ${streakDays}-day ${habitLabel} streak.`
                : `A small treat for your ${streakDays}-day ${habitLabel} streak.`;
    // Provide a reasonable fallback without failing the whole sync flow
    return {
      habitKey,
      milestoneStreak: streakDays,
      title: fallbackTitle,
      description: fallbackDescription,
      category: forcedCategory,
      emoji:
        forcedCategory === "food"
          ? "🍕"
          : forcedCategory === "game"
            ? "🎮"
            : forcedCategory === "movie"
              ? "🎬"
              : forcedCategory === "book"
                ? "📚"
                : forcedCategory === "music"
                  ? "🎻"
                  : "🎉",
      why: `Consistent ${streakDays} days on ${habitLabel} deserves a reward.`,
    };
  }

  let parsed: any;
  try {
    const clean = textBlock.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    // Fallback if parsing fails
    parsed = {
      title: `${streakDays}-Day ${habitLabel} Reward`,
      description: `You've earned a treat for your ${streakDays}-day ${habitLabel} streak! Time to celebrate.`,
      category: forcedCategory,
      emoji: "🏆",
      why: `Consistent ${streakDays} days on ${habitLabel} deserves a reward.`,
    };
  }

  return {
    habitKey,
    milestoneStreak: streakDays,
    title: parsed.title ?? "Reward unlocked",
    description: parsed.description ?? "",
    category: forcedCategory,
    emoji: parsed.emoji ?? "🎁",
    why: parsed.why ?? "",
  };
}

// â”€â”€ Reward Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class RewardStore {
  private rewards: Reward[] = loadRewards();

  getAll(): Reward[] {
    return [...this.rewards].sort((a, b) =>
      b.unlockedAt.localeCompare(a.unlockedAt),
    );
  }

  getUnlocked(): Reward[] {
    return this.rewards.filter((r) => r.status === "unlocked");
  }

  getClaimed(): Reward[] {
    return this.rewards
      .filter((r) => r.status === "claimed")
      .sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));
  }

  // Check if a milestone reward already exists for this habit+streak combo
  hasReward(habitKey: string, milestone: number): boolean {
    return this.rewards.some(
      (r) => r.habitKey === habitKey && r.milestoneStreak === milestone,
    );
  }

  addReward(reward: Omit<Reward, "id" | "status" | "unlockedAt">): Reward {
    const newReward: Reward = {
      ...reward,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: "unlocked",
      unlockedAt: new Date().toISOString(),
    };
    this.rewards.unshift(newReward);
    saveRewards(this.rewards);
    return newReward;
  }

  claimReward(id: string): Reward | null {
    const r = this.rewards.find((r) => r.id === id);
    if (!r || r.status !== "unlocked") return null;
    r.status = "claimed";
    r.claimedAt = new Date().toISOString();
    saveRewards(this.rewards);
    return r;
  }

  // Returns new rewards that were just generated from current streaks
  async syncWithStreaks(
    streaks: Array<{
      habit: string;
      currentStreak: number;
      isComposite: boolean;
    }>,
  ): Promise<Reward[]> {
    const newRewards: Reward[] = [];

    for (const s of streaks) {
      // Find which milestones have been crossed but no reward exists yet
      for (const milestone of STREAK_MILESTONES) {
        if (
          s.currentStreak >= milestone &&
          !this.hasReward(s.habit, milestone)
        ) {
          try {
            // Get a human-readable label
            const label = s.isComposite ? s.habit.replace(/-/g, " ") : s.habit;

            const rewardData = await generateReward(
              s.habit,
              label,
              milestone,
              s.isComposite,
            );
            const reward = this.addReward(rewardData);
            newRewards.push(reward);
          } catch (e) {
            console.error(
              `Failed to generate reward for ${s.habit} at ${milestone}:`,
              e,
            );
          }
        }
      }
    }

    return newRewards;
  }
}

export const rewardStore = new RewardStore();
