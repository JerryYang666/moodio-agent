/**
 * Filter grouping utilities for the browse-shots grouped filter contract.
 *
 * Converts flat selected tag IDs into:
 *   - grouped_filters   (tags grouped by property_id)
 *   - ungrouped_filters  (top-level tags with property_id === null)
 *
 * Also exports shared taxonomy interfaces used by hooks and components.
 */

// ── Shared Taxonomy Interfaces ──────────────────────────────────────────────

export interface TaxonomyPropertyValue {
  id: number;
  value: string;
  property_id: number | null;
  description?: string | null;
  display_order?: number | null;
}

export interface TaxonomyPropertyNode {
  id: number;
  name?: string;            // present for property nodes
  value?: string;           // present for root-level value nodes
  description?: string | null; // present for root-level value nodes
  property_id?: number | null;
  display_order?: number | null;
  values: TaxonomyPropertyValue[];
  children: TaxonomyPropertyNode[];
}

// ── Lookup Builder ──────────────────────────────────────────────────────────

/**
 * Build a flat lookup from property_value_id → TaxonomyPropertyValue
 * by traversing the full property tree.
 */
export function buildPropertyValueLookup(
  properties: TaxonomyPropertyNode[],
): Map<number, TaxonomyPropertyValue> {
  const lookup = new Map<number, TaxonomyPropertyValue>();

  const traverse = (nodes: TaxonomyPropertyNode[]) => {
    for (const node of nodes) {
      // Root-level value nodes (has 'value' but no 'name')
      if (node.value && !node.name) {
        lookup.set(node.id, {
          id: node.id,
          value: node.value,
          property_id: node.property_id ?? null,
          display_order: node.display_order ?? null,
        });
      }

      // Property values nested under this node
      if (node.values) {
        for (const v of node.values) {
          lookup.set(v.id, {
            id: v.id,
            value: v.value,
            property_id: v.property_id ?? null,
            display_order: v.display_order ?? null,
          });
        }
      }

      // Recurse into children
      if (node.children) {
        traverse(node.children);
      }
    }
  };

  traverse(properties);
  return lookup;
}

// ── Grouping Logic ──────────────────────────────────────────────────────────

export interface GroupedFilters {
  /** Maps property_id (as string key) → tag_id[] */
  grouped: Record<string, number[]>;
  /** Top-level tag IDs with property_id === null */
  ungrouped: number[];
}

/**
 * Groups selected filter IDs by their property_id using the lookup.
 *
 * - If a selected ID is **not in the lookup** it is **dropped** (stale/removed).
 * - If the value's property_id is null → ungrouped.
 * - Otherwise → grouped under its property_id.
 */
export function groupFiltersByProperty(
  selectedFilterIds: number[],
  lookup: Map<number, TaxonomyPropertyValue>,
): GroupedFilters {
  const grouped: Record<string, number[]> = {};
  const ungrouped: number[] = [];

  for (const id of selectedFilterIds) {
    const pv = lookup.get(id);
    if (!pv) {
      // Unknown / stale ID – drop it
      continue;
    }

    if (pv.property_id === null || pv.property_id === undefined) {
      ungrouped.push(id);
    } else {
      const key = String(pv.property_id);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(id);
    }
  }

  return { grouped, ungrouped };
}

// ── Query Param Builder ─────────────────────────────────────────────────────

/**
 * Appends `grouped_filters` and `ungrouped_filters` query params to a
 * URLSearchParams instance. Omits params when both are empty.
 */
export function buildGroupedFilterParams(
  selectedFilterIds: number[],
  properties: TaxonomyPropertyNode[],
  params: URLSearchParams,
): void {
  if (selectedFilterIds.length === 0 || properties.length === 0) {
    return;
  }

  const lookup = buildPropertyValueLookup(properties);
  const { grouped, ungrouped } = groupFiltersByProperty(selectedFilterIds, lookup);

  const hasGrouped = Object.keys(grouped).length > 0;
  const hasUngrouped = ungrouped.length > 0;

  if (!hasGrouped && !hasUngrouped) {
    return;
  }

  if (hasGrouped) {
    params.append("grouped_filters", JSON.stringify(grouped));
  }

  if (hasUngrouped) {
    params.append("ungrouped_filters", JSON.stringify(ungrouped));
  }
}
