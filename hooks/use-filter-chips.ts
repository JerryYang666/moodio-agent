import { useMemo } from 'react';
import type { TaxonomyPropertyNode } from '@/lib/filterGrouping';

export interface FilterChip {
    id: number;
    label: string;
    description?: string | null;
}

export function useFilterChips(
    properties: TaxonomyPropertyNode[] | undefined,
    selectedFilters: number[]
): FilterChip[] {
    return useMemo(() => {
        if (!properties) return [];

        const labelMap = new Map<number, string>();
        const descMap = new Map<number, string | null | undefined>();

        const buildMap = (propertyList: TaxonomyPropertyNode[], parentName?: string) => {
            for (const prop of propertyList) {
                // Handle root-level PropertyValues (has 'value' but no 'name')
                if ('value' in prop && prop.value && !prop.name) {
                    // This is a root-level PropertyValue
                    labelMap.set(prop.id, prop.value);
                    descMap.set(prop.id, prop.description);
                } else if (prop.name) {
                    // This is a regular Property with nested values
                    const propName = parentName ? `${parentName} > ${prop.name}` : prop.name;

                    // Map all values under this property
                    prop.values?.forEach((v) => {
                        labelMap.set(v.id, v.value);
                        descMap.set(v.id, v.description);
                    });

                    // Recursively process children
                    if (prop.children?.length > 0) {
                        buildMap(prop.children, propName);
                    }
                }
            }
        };

        buildMap(properties);

        return selectedFilters.map(id => ({
            id,
            label: labelMap.get(id) || `Filter ${id}`,
            description: descMap.get(id),
        }));
    }, [properties, selectedFilters]);
}
