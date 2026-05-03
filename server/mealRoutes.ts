/**
 * server/mealRoutes.ts  — complete, copy-paste ready
 *
 * What changed vs old version:
 *  - POST /api/meals/log  no longer writes Calories (it's a formula now)
 *  - POST /api/meals/log  no longer writes Calorie Delta (it's a formula now)
 *  - POST /api/meals/log  no longer reads back existing totals to accumulate —
 *    the Notion rollup handles summing automatically
 *  - GET  /api/meals/today reads Calories (Rollup) and Protein Rollup (g) fields
 *  - GET  /api/meals/list  added — returns all meal rows for today
 *  - logMeal call site in meal.tsx: pass full analysis object + mealType + note
 *
 * Add to .env:
 *   MEALS_DS=28dcd7f7-f508-47b2-8026-d7f47757033b
 *
 * Notion field summary (read-only = formula/rollup, do not write):
 *   Meals DB:
 *     Calories         → FORMULA: Protein×4 + Carbs×4 + Fat×9  [READ ONLY]
 *     Protein (g)      → number  [write]
 *     Carbs (g)        → number  [write]
 *     Fat (g)          → number  [write]
 *     Habit Tracker Day→ relation to Habit Tracker  [write]
 *     Date             → date    [write]
 *
 *   Habit Tracker DB:
 *     Calories (Rollup)→ ROLLUP sum of Calories from linked Meals  [READ ONLY]
 *     Protein Rollup(g)→ ROLLUP sum of Protein from linked Meals   [READ ONLY]
 *     Calorie Delta    → FORMULA: Calories (Rollup) - 2150         [READ ONLY]
 *     Habits Done      → FORMULA: sum of all 15 habit checkboxes   [READ ONLY]
 */

import type { Express } from "express";
import OpenAI from "openai";
import { Client } from "@notionhq/client";

// ── Config ────────────────────────────────────────────────────────────────────

const HABITS_DB =
  process.env.HABITS_DS ?? "bd13c6c6-ca63-4ac6-8d55-75ac013b278b";
const MEALS_DB = process.env.MEALS_DS ?? "28dcd7f7-f508-47b2-8026-d7f47757033b";
const APP_API_KEY = process.env.APP_API_KEY;
const MAINTENANCE_KCAL = 2150;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNotion() {
  const token = process.env.NOTION_TOKEN;
  if (!token || token.length < 10)
    throw new Error("NOTION_TOKEN not set or invalid");
  return new Client({ auth: token });
}

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: key });
}

function ensureAppKey(req: any, res: any, next: any) {
  if (!APP_API_KEY) return next();
  if (req.header("x-api-key") !== APP_API_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function queryNotionCollection(
  notion: any,
  id: string,
  queryPayload: any,
): Promise<any> {
  // Newer Notion SDKs expose `dataSources` (collection IDs). Older ones use `databases.query`.
  if (notion?.dataSources && typeof notion.dataSources.query === "function") {
    return notion.dataSources.query({ data_source_id: id, ...queryPayload });
  }
  if (notion?.databases && typeof notion.databases.query === "function") {
    return notion.databases.query({ database_id: id, ...queryPayload });
  }
  return notion.request({
    path: `/databases/${id}/query`,
    method: "post",
    body: queryPayload,
  });
}

async function createPageInCollection(
  notion: any,
  id: string,
  properties: any,
): Promise<any> {
  // Creating rows is done via `pages.create` (not `dataSources.create`, which creates a new data source).
  // New schema uses Data Sources (collection IDs) as the parent shape.
  // Keep a fallback to the old database_id parent for older SDKs/spaces.
  try {
    return await notion.pages.create({
      parent: { data_source_id: id },
      properties,
    });
  } catch (e: any) {
    return await notion.pages.create({
      parent: { database_id: id },
      properties,
    });
  }
}

function getTodayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getNotionNumberFromProperty(prop: any): number | null {
  if (!prop) return null;

  if (typeof prop.number === "number") return prop.number;

  if (prop.formula && typeof prop.formula.number === "number")
    return prop.formula.number;

  // Rollups can return { rollup: { type: "number", number: X } } or sometimes { rollup: { number: X } }
  if (prop.rollup && typeof prop.rollup.number === "number")
    return prop.rollup.number;
  if (prop.rollup?.type === "number" && typeof prop.rollup.number === "number")
    return prop.rollup.number;

  // Rollup arrays: attempt to sum numeric entries (defensive)
  if (prop.rollup?.type === "array" && Array.isArray(prop.rollup.array)) {
    const nums = prop.rollup.array
      .map((item: any) => getNotionNumberFromProperty(item))
      .filter((n: any) => typeof n === "number") as number[];
    if (nums.length > 0) return nums.reduce((a, b) => a + b, 0);
  }

  return null;
}

/**
 * Finds today's Habit Tracker entry by Date = today (IST).
 * Creates one if it doesn't exist yet.
 * Returns the Notion page ID.
 */
async function findOrCreateTodayHabitPage(notion: any): Promise<string> {
  const today = getTodayIST();

  const resp = await queryNotionCollection(notion, HABITS_DB, {
    filter: { property: "Date", date: { equals: today } },
    page_size: 1,
  });

  if (resp.results.length > 0) return resp.results[0].id as string;

  // Create today's entry
  const created = await createPageInCollection(notion, HABITS_DB, {
    Name: { title: [{ text: { content: today } }] },
    Date: { date: { start: today } },
  });
  return created.id as string;
}

// ── GPT-4o Vision prompt ──────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are a professional nutritionist and food scientist specializing in Indian cuisine. 
Some more facts before giving out the real answer:
- Always assume the meal is homemade, not restaurant or packaged food, unless the photo clearly shows packaging or restaurant branding.
- I usually eat 4 meals a day. I am a strict vegetarian, avoid egg as well. I compensate for that by taking 2 scoops of whey protein daily, since I am working out 4-5 days a week and want to maintain muscle mass while cutting.
- Breakfast is usually Overnight Oats with 1 scoop whey protein, with chia seeds, flax seeds, pumpkin seeds, sunflower seeds, 10 raisins, 5-6 almonds.
- Lunch and Dinner are usually khichdi of 80 grams of uncooked dal (masoor toor moong), 40 grams of uncooked rice (since I am on cut, I usually keep Dal twice that of rice, all measure uncooked and eaten in 2 separate meals), 
1-2 teaspoons of ghee, 200 gram curd, and 50 grams of uncooked Soya Chunks or Paneer or Tofu for protein.
- Afternoon snack is usually 250 gram curd with 1 scoop whey protein, with chia seeds, flax seeds, pumpkin seeds, sunflower seeds, 10 raisins, 5-6 almonds.
- Sometimes I will have junk food or sometimes healthy restaurant food which is not homecooked, but that's usually once a week.
- If multiple items are present, sum up the macros/micros for the whole meal.
- Be conservative in your estimates if you're unsure — it's better to underestimate than overestimate calories/protein/carbs/fat.

Analyze this meal photo carefully.

Return ONLY a valid JSON object with this exact structure. No markdown, no explanation, no extra text:
{
  "meal_name": "concise descriptive name of the meal",
  "description": "1-2 sentences: what you see, estimated portion size, and key assumptions",
  "confidence": "high" | "medium" | "low",
  "confidence_note": "brief reason for confidence level",
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "fiber_g": <number>,
  "sugar_g": <number>,
  "sodium_mg": <number>,
  "saturated_fat_g": <number>,
  "potassium_mg": <number>,
  "calcium_mg": <number>,
  "iron_mg": <number>,
  "vitamin_c_mg": <number>,
  "vitamin_d_iu": <number>,
  "tags": ["array", "of", "2-5", "food", "tags"],
  "warnings": "dietary notes e.g. high sodium, processed food, allergens — or empty string"
}

Note: Do NOT include a calories field — it is calculated automatically as (protein×4) + (carbs×4) + (fat×9).

Estimation guidelines:
- Use standard Indian portion sizes when applicable
- If multiple items, sum all macros/micros
- For packaged food, use standard nutritional values
- Be conservative on protein/carbs/fat when unsure
- All numbers must be non-negative integers or decimals rounded to 1 place`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MealAnalysis {
  meal_name: string;
  description: string;
  confidence: "high" | "medium" | "low";
  confidence_note: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  saturated_fat_g: number;
  potassium_mg: number;
  calcium_mg: number;
  iron_mg: number;
  vitamin_c_mg: number;
  vitamin_d_iu: number;
  tags: string[];
  warnings: string;
}

// Calories computed from macros — matches the Notion formula exactly
function computeCalories(protein: number, carbs: number, fat: number): number {
  return Math.round(protein * 4 + carbs * 4 + fat * 9);
}

// ── Routes ────────────────────────────────────────────────────────────────────

export function registerMealRoutes(app: Express) {
  // ── POST /api/meals/analyze ───────────────────────────────────────────────
  // Body: { image: "data:image/jpeg;base64,..." | "<raw base64>", mimeType?: string }
  // Returns: MealAnalysis (no calories field — computed by Notion formula)
  // Frontend should compute calories locally as protein*4 + carbs*4 + fat*9 for display
  app.post("/api/meals/analyze", ensureAppKey, async (req, res) => {
    try {
      const { image, mimeType } = req.body as {
        image: string;
        mimeType?: string;
      };
      if (!image) return res.status(400).json({ error: "image is required" });

      let base64Data: string;
      let detectedMime: string;
      if (image.startsWith("data:")) {
        const [header, data] = image.split(",");
        base64Data = data;
        detectedMime = header.split(":")[1]?.split(";")[0] ?? "image/jpeg";
      } else {
        base64Data = image;
        detectedMime = mimeType ?? "image/jpeg";
      }

      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${detectedMime};base64,${base64Data}`,
                  detail: "high",
                },
              },
              { type: "text", text: ANALYSIS_PROMPT },
            ],
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "";
      const clean = raw.replace(/```json|```/g, "").trim();

      let parsed: MealAnalysis;
      try {
        parsed = JSON.parse(clean);
      } catch {
        return res.status(422).json({
          error: "Failed to parse GPT-4o response as JSON",
          raw: clean.slice(0, 500),
        });
      }

      // Sanitize numeric fields
      const numFields = [
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "sugar_g",
        "sodium_mg",
        "saturated_fat_g",
        "potassium_mg",
        "calcium_mg",
        "iron_mg",
        "vitamin_c_mg",
        "vitamin_d_iu",
      ];
      for (const f of numFields)
        (parsed as any)[f] = Number((parsed as any)[f]) || 0;

      // Add computed calories to the response for frontend display
      // (Notion will also compute it independently via formula)
      const calories = computeCalories(
        parsed.protein_g,
        parsed.carbs_g,
        parsed.fat_g,
      );

      res.json({ ...parsed, calories });
    } catch (e: any) {
      console.error("meals/analyze error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/meals/log ───────────────────────────────────────────────────
  // Creates a row in the Meals DB linked to today's Habit Tracker entry.
  // Does NOT write Calories (formula), Calorie Delta (formula), or accumulated
  // totals — Notion handles all of that automatically via formulas + rollups.
  //
  // Body: MealAnalysis fields (from /analyze response) + { mealType?, note? }
  // Note: calories in body is ignored for Notion write — it's a formula field.
  app.post("/api/meals/log", ensureAppKey, async (req, res) => {
    try {
      const body = req.body as MealAnalysis & {
        calories?: number; // present from analyze response, ignored for Notion write
        mealType?: string;
        note?: string;
      };

      const {
        protein_g,
        carbs_g = 0,
        fat_g = 0,
        fiber_g = 0,
        sugar_g = 0,
        sodium_mg = 0,
        potassium_mg = 0,
        calcium_mg = 0,
        iron_mg = 0,
        vitamin_c_mg = 0,
        vitamin_d_iu = 0,
        meal_name,
        description = "",
        confidence = "medium",
        warnings = "",
        mealType = "Lunch",
        note = "",
      } = body;

      if (typeof protein_g !== "number") {
        return res.status(400).json({ error: "protein_g is required" });
      }

      const notion = getNotion();
      const today = getTodayIST();
      const habitPageId = await findOrCreateTodayHabitPage(notion);

      // "Lunch · office note — Dal Rice"  or  "Lunch — Dal Rice"
      const mealLabel = note
        ? `${mealType} · ${note} — ${meal_name}`
        : `${mealType} — ${meal_name}`;

      const confidenceLabel =
        confidence === "high"
          ? "High"
          : confidence === "medium"
            ? "Medium"
            : "Low";

      // Create Meals DB row
      // NOTE: "Calories" is intentionally omitted — it is a read-only formula field
      const created = await createPageInCollection(notion, MEALS_DB, {
        Name: { title: [{ text: { content: mealLabel } }] },
        Date: { date: { start: today } },
        "Meal Type": { select: { name: mealType } },
        "Habit Tracker Day": { relation: [{ id: habitPageId }] },
        // Macros — Calories will be auto-computed by Notion formula
        "Protein (g)": { number: Math.round(protein_g) },
        "Carbs (g)": { number: Math.round(carbs_g) },
        "Fat (g)": { number: Math.round(fat_g) },
        // Micros
        "Fiber (g)": { number: Math.round(fiber_g) },
        "Sugar (g)": { number: Math.round(sugar_g) },
        "Sodium (mg)": { number: Math.round(sodium_mg) },
        "Potassium (mg)": { number: Math.round(potassium_mg) },
        "Calcium (mg)": { number: Math.round(calcium_mg) },
        "Iron (mg)": { number: Math.round(iron_mg) },
        "Vitamin C (mg)": { number: Math.round(vitamin_c_mg) },
        "Vitamin D (IU)": { number: Math.round(vitamin_d_iu) },
        Confidence: { select: { name: confidenceLabel } },
        Notes: {
          rich_text: [
            {
              text: {
                content:
                  `${description}${warnings ? " ⚠ " + warnings : ""}`.slice(
                    0,
                    2000,
                  ),
              },
            },
          ],
        },
      });

      // Compute calories locally for the response (same formula as Notion)
      const computedCalories = computeCalories(protein_g, carbs_g, fat_g);

      res.json({
        ok: true,
        mealPageId: created.id,
        mealLabel,
        habitPageId,
        meal: {
          protein_g: Math.round(protein_g),
          carbs_g: Math.round(carbs_g),
          fat_g: Math.round(fat_g),
          calories: computedCalories,
        },
        // Rollup totals update asynchronously in Notion — read /today for live totals
        targets: {
          calories: 2150,
          maintenance: MAINTENANCE_KCAL,
          protein_g: 150,
        },
      });
    } catch (e: any) {
      const notionStatus = e?.status ?? e?.response?.status ?? null;
      const notionCode =
        e?.code ?? e?.body?.code ?? e?.response?.data?.code ?? null;
      const notionMessage =
        e?.body?.message ??
        e?.response?.data?.message ??
        e?.message ??
        "Unknown error";
      console.error("meals/log error:", {
        status: notionStatus,
        code: notionCode,
        message: notionMessage,
      });
      res.status(500).json({
        error: notionMessage,
        notion: {
          status: notionStatus,
          code: notionCode,
        },
      });
    }
  });

  // ── GET /api/meals/today ──────────────────────────────────────────────────
  // Returns today's running macro totals from Habit Tracker rollup fields.
  // These update automatically as meals are linked — no manual writes needed.
  app.get("/api/meals/today", ensureAppKey, async (_req, res) => {
    try {
      const notion = getNotion();
      const habitPageId = await findOrCreateTodayHabitPage(notion);
      const page = await (notion as any).pages.retrieve({
        page_id: habitPageId,
      });

      const caloriesFromFormula =
        getNotionNumberFromProperty(page.properties?.["Calories Rollup (g)"]) ??
        null;

      // Legacy fallback: older field "Calories (Rollup)" should only be used if it's numeric.
      const caloriesFromLegacyRollup =
        getNotionNumberFromProperty(page.properties?.["Calories (Rollup)"]) ??
        null;

      const calories = caloriesFromFormula ?? caloriesFromLegacyRollup ?? 0;

      const proteinRollup =
        getNotionNumberFromProperty(page.properties?.["Protein Rollup (g)"]) ??
        0;

      // Calorie Delta is now a formula — read it, don't compute it
      const calorieDeltaFormula =
        getNotionNumberFromProperty(page.properties?.["Calorie Delta"]) ?? null;
      // Fallback: compute locally if formula hasn't propagated yet
      const calorieDelta =
        calorieDeltaFormula ??
        (calories > 0 ? calories - MAINTENANCE_KCAL : null);

      res.json({
        calories,
        protein_g: proteinRollup,
        calorieDelta,
        targets: {
          calories: 2150, // gym day target
          maintenance: MAINTENANCE_KCAL,
          protein_g: 150,
        },
        pageId: habitPageId,
      });
    } catch (e: any) {
      console.error("meals/today error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/meals/list ───────────────────────────────────────────────────
  // Returns all individual meal rows logged today from the Meals DB.
  // Calories here is the formula result from Notion (protein*4+carbs*4+fat*9).
  app.get("/api/meals/list", ensureAppKey, async (_req, res) => {
    try {
      const notion = getNotion();
      const today = getTodayIST();

      const resp = await queryNotionCollection(notion, MEALS_DB, {
        filter: { property: "Date", date: { equals: today } },
        sorts: [{ property: "Date", direction: "ascending" }],
      });

      const meals = (resp.results as any[]).map((page: any) => {
        const protein = page.properties?.["Protein (g)"]?.number ?? 0;
        const carbs = page.properties?.["Carbs (g)"]?.number ?? 0;
        const fat = page.properties?.["Fat (g)"]?.number ?? 0;

        // Notion formula result — falls back to local computation if not yet propagated
        const caloriesFormula =
          page.properties?.["Calories"]?.formula?.number ?? null;
        const calories =
          caloriesFormula ?? computeCalories(protein, carbs, fat);

        return {
          id: page.id,
          name: page.properties?.Name?.title?.[0]?.plain_text ?? "",
          mealType: page.properties?.["Meal Type"]?.select?.name ?? "",
          calories,
          protein_g: protein,
          carbs_g: carbs,
          fat_g: fat,
          confidence: page.properties?.["Confidence"]?.select?.name ?? "",
          notes: page.properties?.["Notes"]?.rich_text?.[0]?.plain_text ?? "",
        };
      });

      const totals = meals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein_g: acc.protein_g + m.protein_g,
          carbs_g: acc.carbs_g + m.carbs_g,
          fat_g: acc.fat_g + m.fat_g,
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      );

      res.json({
        meals,
        totals,
        calorieDelta:
          totals.calories > 0 ? totals.calories - MAINTENANCE_KCAL : null,
        targets: {
          calories: 2150,
          maintenance: MAINTENANCE_KCAL,
          protein_g: 150,
        },
      });
    } catch (e: any) {
      console.error("meals/list error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
