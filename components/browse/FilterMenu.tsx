'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslations } from 'next-intl';
import type { RootState } from '@/lib/redux/store';
import {
  setSelectedFilters as setQuerySelectedFilters,
  setContentTypes as setQueryContentTypes,
  setIsAigc as setQueryIsAigc
} from '@/lib/redux/slices/querySlice';
import { useGetPropertiesQuery } from '@/lib/redux/services/api';
import { PropertyFilterTree } from '@/components/browse/PropertyFilterTree';
import { ContentTypeFilter } from './ContentTypeFilter';
import { AiGeneratedFilter, type SourceFilterValue } from './AiGeneratedFilter';
import { useAutoExpandFilters } from '@/hooks/use-auto-expand-filters';
import { buildPropertyValueLookup } from '@/lib/filterGrouping';
import { addToast } from '@heroui/toast';

const FilterMenu: React.FC = () => {
  const t = useTranslations("browse");
  const dispatch = useDispatch();
  const selectedFilters = useSelector((state: RootState) => state.query.selectedFilters);
  const contentTypes = useSelector((state: RootState) => state.query.contentTypes);
  const isAigc = useSelector((state: RootState) => state.query.isAigc);

  const { data: properties, isLoading, error } = useGetPropertiesQuery();
  const [expandedState, setExpandedState] = useState<Record<number, boolean>>({});

  // Track previous selected filters to avoid redundant sanitization dispatches
  const prevSanitizedRef = useRef<string>("");

  // Auto-expand logic
  useAutoExpandFilters(properties, selectedFilters, setExpandedState);

  // Sanitize selected filters when taxonomy data refreshes/changes.
  // Drop any selected IDs that no longer exist in the current taxonomy.
  useEffect(() => {
    if (!properties || properties.length === 0 || selectedFilters.length === 0) {
      return;
    }

    const lookup = buildPropertyValueLookup(properties);
    const valid = selectedFilters.filter((id) => lookup.has(id));
    const removedCount = selectedFilters.length - valid.length;

    if (removedCount === 0) return;

    // Build a key so we don't dispatch the same sanitization twice
    const key = valid.join(",");
    if (prevSanitizedRef.current === key) return;
    prevSanitizedRef.current = key;

    dispatch(setQuerySelectedFilters(valid));

    addToast({
      title: t("filtersUpdated"),
      description: t("filtersRemovedCount", { count: removedCount }),
      color: "warning",
    });
  }, [properties, selectedFilters, dispatch]);

  const handleFilterToggle = (filterId: number) => {
    const newSelectedFilters = selectedFilters.includes(filterId)
      ? selectedFilters.filter(id => id !== filterId)
      : [...selectedFilters, filterId];
    dispatch(setQuerySelectedFilters(newSelectedFilters));
  };

  // Derive source filter value
  const sourceFilterValue: SourceFilterValue =
    isAigc === undefined ? undefined :
      isAigc === true ? 'ai' : 'non_ai';

  const handleSourceFilterChange = (value: SourceFilterValue) => {
    const newIsAigc =
      value === undefined ? undefined :
        value === 'ai' ? true : false;
    dispatch(setQueryIsAigc(newIsAigc));
  };

  return (
    <div className="w-full flex flex-col h-full">
      {/* Fixed filters at top */}
      <div className="shrink-0 flex flex-col gap-2 mb-3">
        <ContentTypeFilter
          selectedTypes={contentTypes}
          onChange={(types) => dispatch(setQueryContentTypes(types))}
        />

        <AiGeneratedFilter
          value={sourceFilterValue}
          onChange={handleSourceFilterChange}
        />
      </div>

      {/* Scrollable property tree */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <PropertyFilterTree
          properties={properties || []}
          selectedFilters={selectedFilters}
          expandedState={expandedState}
          onToggleExpanded={(id) => setExpandedState(prev => ({ ...prev, [id]: !prev[id] }))}
          onFilterToggle={handleFilterToggle}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </div>
  );
};

export default FilterMenu;
