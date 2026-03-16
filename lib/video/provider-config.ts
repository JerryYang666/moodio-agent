import {
  type VideoProvider,
  type ProviderVariant,
  type VideoModelConfig,
  type VideoModelParam,
  getVideoModel,
} from "./models";

/**
 * Active provider selection per model.
 * Edit this map to switch a model to a different provider.
 */
const ACTIVE_PROVIDERS: Partial<Record<string, VideoProvider>> = {
  "seedance-v1.5-pro": "fal",
  "hailuo-2.3-fast-pro": "fal",
  "hailuo-2.3-pro": "fal",
  "hailuo-02-pro": "fal",
  "wan-v2.6": "fal",
  "kling-v2.6-pro": "fal",
  "kling-o1-pro": "fal",
  "kling-o3-pro": "fal",
  "kling-v3-pro": "fal",
  "veo-3.1": "fal",
  "veo-3.1-first-last-frame": "fal",
  "sora-2-pro": "fal",
};

/**
 * Get the active provider variant for a model.
 * Falls back to the first provider in the model's providers list
 * if the model is not in the active providers map.
 */
export function getActiveProvider(modelId: string): ProviderVariant {
  const model = getVideoModel(modelId);
  if (!model) {
    throw new Error(`Unknown video model: ${modelId}`);
  }

  const activeProvider = ACTIVE_PROVIDERS[modelId];
  if (activeProvider) {
    const variant = model.providers.find((p) => p.provider === activeProvider);
    if (variant) return variant;
  }

  return model.providers[0];
}

/**
 * Resolve effective parameters for a provider variant by merging
 * the base model params with the variant's overrides.
 */
export function resolveParamsForProvider(
  model: VideoModelConfig,
  variant: ProviderVariant
): VideoModelParam[] {
  if (!variant.paramOverrides) return model.params;

  return model.params.map((p) => {
    const override = variant.paramOverrides![p.name];
    if (!override) return p;
    return { ...p, ...override };
  });
}

/**
 * Apply param name mapping for a provider that uses different param names.
 * Returns a new params object with keys renamed according to the mapping.
 */
export function applyParamMapping(
  params: Record<string, any>,
  mapping?: Record<string, string>
): Record<string, any> {
  if (!mapping) return params;

  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    const mappedKey = mapping[key] ?? key;
    mapped[mappedKey] = value;
  }
  return mapped;
}
