import { Parser } from "expr-eval-fork";
import { db } from "@/lib/db";
import { modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getVideoModel } from "@/lib/video/models";
import { IMAGE_MODEL_IDS } from "@/lib/image/models";
import type { ImageSize } from "@/lib/image/types";

// Default cost if no formula is defined
const DEFAULT_COST = 0;

// Cache for pricing formulas (cleared on update)
const formulaCache = new Map<string, string>();

/**
 * Prepare params for formula evaluation.
 * Converts string values to numbers where appropriate and handles booleans.
 */
function prepareParams(params: Record<string, any>): Record<string, any> {
  const prepared: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key.includes("url") || key.includes("image")) continue;
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) continue;

    if (typeof value === "boolean") {
      prepared[key] = value ? 1 : 0;
    } else if (typeof value === "string") {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        prepared[key] = num;
      } else {
        prepared[key] = value;
      }
    } else {
      prepared[key] = value;
    }
  }

  if (typeof prepared.mode === "string") {
    prepared.mode_is_pro = prepared.mode === "pro" ? 1 : 0;
  }

  return prepared;
}

/**
 * Safely evaluate a pricing formula with given parameters.
 * Uses expr-eval which is safe (no eval/Function).
 */
export function evaluateFormula(
  formula: string,
  params: Record<string, any>
): number {
  try {
    const parser = new Parser();
    const expr = parser.parse(formula);
    const preparedParams = prepareParams(params);
    const result = expr.evaluate(preparedParams);

    // Ensure result is a positive integer
    return Math.max(0, Math.round(result));
  } catch (error) {
    console.error("[Pricing] Formula evaluation error:", error);
    console.error("[Pricing] Formula:", formula);
    console.error("[Pricing] Params:", params);
    return DEFAULT_COST;
  }
}

/**
 * Get the pricing formula for a model from the database.
 * Returns null if no formula is defined.
 */
export async function getModelFormula(
  modelId: string
): Promise<string | null> {
  // Check cache first
  if (formulaCache.has(modelId)) {
    return formulaCache.get(modelId)!;
  }

  const [pricing] = await db
    .select()
    .from(modelPricing)
    .where(eq(modelPricing.modelId, modelId))
    .limit(1);

  if (pricing) {
    formulaCache.set(modelId, pricing.formula);
    return pricing.formula;
  }

  return null;
}

const IMAGE_SIZE_MAP: Record<ImageSize, number> = { "1k": 1, "2k": 2, "4k": 4 };

/**
 * Convert an ImageSize string to its numeric resolution value for pricing formulas.
 */
export function parseImageSizeToNumber(size: ImageSize): number {
  return IMAGE_SIZE_MAP[size] ?? 2;
}

/**
 * Calculate the cost for a generation.
 * Looks up the formula from DB, falls back to default if not found.
 * For image models, falls back to "Image/all" before returning DEFAULT_COST.
 * Merges model param defaults so formula variables are always defined.
 */
export async function calculateCost(
  modelId: string,
  params: Record<string, any>
): Promise<number> {
  let formula = await getModelFormula(modelId);

  // Image model fallback: try "Image/all" if no model-specific formula
  if (!formula && IMAGE_MODEL_IDS.has(modelId)) {
    formula = await getModelFormula("Image/all");
  }

  if (!formula) {
    console.warn(`[Pricing] No formula found for model ${modelId}, using default`);
    return DEFAULT_COST;
  }

  const paramsWithDefaults = { ...params };
  const model = getVideoModel(modelId);
  if (model) {
    for (const param of model.params) {
      if (param.default !== undefined && paramsWithDefaults[param.name] === undefined) {
        paramsWithDefaults[param.name] = param.default;
      }
    }
  }

  // For image models, ensure resolution has a default
  if (IMAGE_MODEL_IDS.has(modelId) || modelId === "Image/all") {
    if (paramsWithDefaults.resolution === undefined) {
      paramsWithDefaults.resolution = 2;
    }
  }

  return evaluateFormula(formula, paramsWithDefaults);
}

/**
 * Validate a pricing formula without saving it.
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateFormula(
  formula: string,
  testParams?: Record<string, any>
): { valid: true } | { valid: false; error: string } {
  try {
    const parser = new Parser();
    const expr = parser.parse(formula);

    // If test params provided, try to evaluate
    if (testParams) {
      const preparedParams = prepareParams(testParams);
      const result = expr.evaluate(preparedParams);

      if (typeof result !== "number" || isNaN(result)) {
        return { valid: false, error: "Formula must evaluate to a number" };
      }
    }

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || "Invalid formula syntax" };
  }
}

/**
 * Save or update a pricing formula.
 */
export async function savePricingFormula(
  modelId: string,
  formula: string,
  description?: string
): Promise<void> {
  // Validate first
  const validation = validateFormula(formula);
  if (!validation.valid) {
    throw new Error(`Invalid formula: ${validation.error}`);
  }

  // Upsert
  const existing = await db
    .select()
    .from(modelPricing)
    .where(eq(modelPricing.modelId, modelId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(modelPricing)
      .set({
        formula,
        description,
        updatedAt: new Date(),
      })
      .where(eq(modelPricing.modelId, modelId));
  } else {
    await db.insert(modelPricing).values({
      modelId,
      formula,
      description,
    });
  }

  // Clear cache
  formulaCache.delete(modelId);
}

/**
 * Delete a pricing formula.
 */
export async function deletePricingFormula(modelId: string): Promise<void> {
  await db.delete(modelPricing).where(eq(modelPricing.modelId, modelId));
  formulaCache.delete(modelId);
}

/**
 * Get all pricing formulas.
 */
export async function getAllPricingFormulas() {
  return db.select().from(modelPricing).orderBy(modelPricing.modelId);
}

/**
 * Clear the formula cache (call after updates from admin).
 */
export function clearFormulaCache(): void {
  formulaCache.clear();
}
