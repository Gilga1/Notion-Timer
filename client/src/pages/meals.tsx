/**
 * client/src/pages/meal.tsx
 *
 * Meal photo -> GPT-4o Vision -> macro breakdown -> sync to Notion.
 * All API calls go through your own backend — OpenAI key stays in .env.
 *
 * Add to router:
 *   import MealPage from "./pages/meal";
 *   <Route path="/meal" component={MealPage} />
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function apiHeaders() {
  const key = (import.meta as any)?.env?.VITE_APP_API_KEY as string | undefined;
  return {
    "Content-Type": "application/json",
    ...(key ? { "x-api-key": key } : {}),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MealAnalysis {
  meal_name: string;
  description: string;
  confidence: "high" | "medium" | "low";
  confidence_note: string;
  // calories is computed by backend as protein*4 + carbs*4 + fat*9
  // and returned for display — do NOT send it back to /log (Notion formula handles it)
  calories: number;
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

interface TodayMacros {
  calories: number; // from Calories Rollup (g) formula on Habit Tracker (fallbacks server-side)
  protein_g: number; // from Protein Rollup (g) on Habit Tracker
  calorieDelta: number | null; // from Calorie Delta formula on Habit Tracker
  // Some servers (older `server/routes.ts`) return only totals; guard targets access.
  targets?: { calories: number; maintenance: number; protein_g: number };
  pageId: string;
}

interface LogMealResponse {
  ok: true;
  mealPageId: string;
  mealLabel: string;
  habitPageId: string;
  meal: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    calories: number; // computed locally, same formula as Notion
  };
  targets: { calories: number; maintenance: number; protein_g: number };
}

interface LoggedMeal {
  name: string;
  type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function analyzeMeal(imageDataUrl: string): Promise<MealAnalysis> {
  const r = await fetch("/api/meals/analyze", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Analysis failed");
  }
  return r.json();
}

// Sends the full analysis object + mealType + note to the backend.
// Backend writes Protein, Carbs, Fat to Notion — Notion formula computes Calories.
async function logMeal(
  analysis: MealAnalysis,
  mealType: string,
  note: string,
): Promise<LogMealResponse> {
  const r = await fetch("/api/meals/log", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ ...analysis, mealType, note }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Log failed");
  }
  return r.json();
}

// Reads today's running totals from Habit Tracker rollup fields
async function fetchTodayMacros(): Promise<TodayMacros> {
  const r = await fetch("/api/meals/today", { headers: apiHeaders() });
  if (!r.ok) throw new Error("Failed to fetch today's macros");
  return r.json();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct =
    max > 0 ? Math.min(Math.round((value / max) * 100), 100) : value > 0 ? 100 : 0;
  const over = value > max;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={over ? "text-red-600 dark:text-red-400 font-medium" : "text-foreground"}>
          {value}
          {max ? ` / ${max}` : ""}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? "#e05b5b" : color,
          }}
        />
      </div>
    </div>
  );
}

function ConfidenceBadge({ level, note }: { level: string; note: string }) {
  const styles: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
    medium:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
    low: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${styles[level] ?? styles.medium}`}
    >
      Confidence: {level}
      {note ? ` · ${note}` : ""}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack", "Pre-workout"];

export default function MealPage() {
  const qc = useQueryClient();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mealType, setMealType] = useState("Lunch");
  const [note, setNote] = useState("");
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [loggedMeals, setLoggedMeals] = useState<LoggedMeal[]>([]);
  const [status, setStatus] = useState<{
    msg: string;
    type: "info" | "success" | "error";
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [logging, setLogging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const { data: todayMacros, refetch: refetchMacros } = useQuery({
    queryKey: ["today-macros"],
    queryFn: fetchTodayMacros,
    staleTime: 30_000,
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        setImageUrl(dataUrl);
        setAnalysis(null);
        setStatus(null);
        setAnalyzing(true);
        try {
          const result = await analyzeMeal(dataUrl);
          setAnalysis(result);
        } catch (err: any) {
          setStatus({ msg: err.message, type: "error" });
        } finally {
          setAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = ""; // allow re-selecting same file
    },
    [],
  );

  const handleLog = async () => {
    if (!analysis) return;
    setLogging(true);
    try {
      // Pass full analysis + mealType + note — backend ignores calories (formula field)
      const result = await logMeal(analysis, mealType, note);

      setLoggedMeals((prev) => [
        ...prev,
        {
          name: analysis.meal_name,
          type: mealType + (note ? ` · ${note}` : ""),
          calories: result.meal.calories, // locally computed, same as Notion formula
          protein: result.meal.protein_g,
          carbs: result.meal.carbs_g,
          fat: result.meal.fat_g,
        },
      ]);

      const delta = result.meal.calories - result.targets.maintenance;
      const deltaSign = delta >= 0 ? "+" : "";
      setStatus({
        msg: `Logged "${result.mealLabel}" — ${result.meal.calories} kcal (${deltaSign}${delta} from maintenance)`,
        type: "success",
      });

      // Refetch Notion rollup totals — small delay lets Notion propagate the rollup
      setTimeout(() => {
        refetchMacros();
        qc.invalidateQueries({ queryKey: ["today-macros"] });
      }, 2500);

      // Reset for next meal
      setImageUrl(null);
      setAnalysis(null);
      setNote("");
    } catch (err: any) {
      setStatus({ msg: err.message, type: "error" });
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Meals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Take a photo — AI extracts macros — syncs to Notion
        </p>
      </div>

      {/* Today's running totals from Notion rollup */}
      {todayMacros && (
        <div className="mb-5 p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Today's totals
            </span>
            {todayMacros.calorieDelta !== null && (
              <span
                className={`text-xs font-medium ${
                  todayMacros.calorieDelta <= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {todayMacros.calorieDelta >= 0 ? "+" : ""}
                {todayMacros.calorieDelta} kcal delta
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <div
                className="text-lg font-semibold"
                style={{ color: "#e09c40" }}
              >
                {todayMacros.calories}
              </div>
              <div className="text-[10px] text-muted-foreground">Calories</div>
              {todayMacros.targets && (
                <div className="text-[10px] text-muted-foreground/70">
                  / {todayMacros.targets.calories}
                </div>
              )}
            </div>
            <div className="text-center">
              <div
                className="text-lg font-semibold"
                style={{ color: "#5b9bd5" }}
              >
                {todayMacros.protein_g}g
              </div>
              <div className="text-[10px] text-muted-foreground">Protein</div>
              {todayMacros.targets && (
                <div className="text-[10px] text-muted-foreground/70">
                  / {todayMacros.targets.protein_g}g
                </div>
              )}
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {loggedMeals.length}
              </div>
              <div className="text-[10px] text-muted-foreground">Meals</div>
              <div className="text-[10px] text-muted-foreground/70">
                this session
              </div>
            </div>
          </div>

          <MacroBar
            label="Calories"
            value={todayMacros.calories}
            max={todayMacros.targets?.calories ?? todayMacros.calories ?? 0}
            color="#e09c40"
          />
          <div className="mt-2">
            <MacroBar
              label="Protein"
              value={todayMacros.protein_g}
              max={todayMacros.targets?.protein_g ?? todayMacros.protein_g ?? 0}
              color="#5b9bd5"
            />
          </div>
        </div>
      )}

      {/* Meal type + note */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setMealType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mealType === type
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)…"
          className="flex-1 min-w-[120px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500"
        />
      </div>

      {/* Hidden file input — capture="environment" opens rear camera on Android */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Camera zone */}
      {!imageUrl && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed border-border rounded-xl hover:bg-muted/30 transition-all mb-4"
        >
          <span className="text-4xl">📷</span>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Take a photo or upload
            </p>
            <p className="text-xs text-zinc-500 mt-1">JPEG · PNG · HEIC</p>
          </div>
        </button>
      )}

      {/* Image preview */}
      {imageUrl && (
        <div className="mb-4">
          <img
            src={imageUrl}
            alt="Meal"
            className="w-full rounded-2xl max-h-64 object-cover border border-zinc-800"
          />
          {!analyzing && (
            <button
              onClick={() => {
                setImageUrl(null);
                setAnalysis(null);
                setStatus(null);
              }}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Retake
            </button>
          )}
        </div>
      )}

      {/* Analyzing spinner */}
      {analyzing && (
        <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl mb-4 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-muted-foreground/40 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Analyzing with GPT-4o Vision…
        </div>
      )}

      {/* Status toast */}
      {status && (
        <div
          className={`p-3 rounded-xl text-sm mb-4 ${
            status.type === "success"
              ? "bg-card border border-border border-l-4 border-l-emerald-500 text-foreground"
              : status.type === "error"
                ? "bg-card border border-border border-l-4 border-l-red-500 text-foreground"
                : "bg-card border border-border text-foreground"
          }`}
        >
          {status.msg}
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="mb-4 space-y-3">
          <div className="p-5 bg-card border border-border rounded-xl">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">
                {mealType}
                {note ? ` · ${note}` : ""} — {analysis.meal_name}
              </h3>
              <ConfidenceBadge
                level={analysis.confidence}
                note={analysis.confidence_note}
              />
            </div>

            {/* Macro tiles */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                {
                  label: "Calories",
                  value: analysis.calories,
                  unit: "kcal",
                  color: "#e09c40",
                },
                {
                  label: "Protein",
                  value: analysis.protein_g,
                  unit: "g",
                  color: "#5b9bd5",
                },
                {
                  label: "Carbs",
                  value: analysis.carbs_g,
                  unit: "g",
                  color: "#4caf7d",
                },
                {
                  label: "Fat",
                  value: analysis.fat_g,
                  unit: "g",
                  color: "#9b8fdd",
                },
              ].map(({ label, value, unit, color }) => (
                <div
                  key={label}
                  className="bg-muted/40 border border-border rounded-xl p-3 text-center"
                >
                  <div className="text-base font-bold" style={{ color }}>
                    {Math.round(value)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{unit}</div>
                  <div className="text-[9px] text-muted-foreground/70">{label}</div>
                </div>
              ))}
            </div>

            {/* Micros */}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Micronutrients
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  ["Fiber", `${Math.round(analysis.fiber_g)}g`],
                  ["Sugar", `${Math.round(analysis.sugar_g)}g`],
                  ["Saturated fat", `${Math.round(analysis.saturated_fat_g)}g`],
                  ["Sodium", `${Math.round(analysis.sodium_mg)}mg`],
                  ["Potassium", `${Math.round(analysis.potassium_mg)}mg`],
                  ["Calcium", `${Math.round(analysis.calcium_mg)}mg`],
                  ["Iron", `${Math.round(analysis.iron_mg)}mg`],
                  ["Vitamin C", `${Math.round(analysis.vitamin_c_mg)}mg`],
                  ["Vitamin D", `${Math.round(analysis.vitamin_d_iu)}IU`],
                ].map(([name, val]) => (
                  <div key={name} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="text-foreground font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Description + warnings */}
            <div className="mt-3 text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-lg p-3">
              {analysis.description}
              {analysis.warnings && (
                <span className="text-amber-500"> ⚠ {analysis.warnings}</span>
              )}
            </div>

            {/* Tags */}
            {analysis.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {analysis.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Log + retake buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleLog}
              disabled={logging}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {logging ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Logging…
                </>
              ) : (
                <>✓ Add to today — {Math.round(analysis.calories)} kcal</>
              )}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-xl transition-colors"
            >
              Next meal
            </button>
          </div>
        </div>
      )}

      {/* Meals logged this session */}
      {loggedMeals.length > 0 && (
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
            Logged this session
          </p>
          <div className="space-y-2">
            {loggedMeals.map((m, i) => (
              <div
                key={i}
                className="flex justify-between items-center text-sm"
              >
                <div>
                  <span className="text-zinc-300 font-medium">{m.type}</span>
                  <span className="text-zinc-500 text-xs"> · {m.name}</span>
                </div>
                <span className="text-amber-400 font-medium text-xs">
                  {m.calories} kcal
                </span>
              </div>
            ))}
            <div className="border-t border-zinc-800 pt-2 flex justify-between text-xs font-medium">
              <span className="text-zinc-400">Session total</span>
              <span className="text-amber-400">
                {loggedMeals.reduce((s, m) => s + m.calories, 0)} kcal
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
