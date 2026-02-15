'use client';

import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslations } from 'next-intl';
import type { RootState } from '@/lib/redux/store';
import { setSelectedFilters, setTextSearch } from '@/lib/redux/slices/querySlice';
import { useGetPropertiesQuery } from '@/lib/redux/services/api';
import { FilterChipBar } from '@/components/browse/FilterChipBar';
import { useFilterChips } from '@/hooks/use-filter-chips';

const Breadcrumb: React.FC = () => {
  const t = useTranslations("browse");
  const dispatch = useDispatch();
  const { textSearch, selectedFilters } = useSelector((state: RootState) => state.query);
  const { data: properties } = useGetPropertiesQuery();

  // Build filter name lookup
  const filterChips = useFilterChips(properties, selectedFilters);

  const contextText = textSearch
    ? t("showingShotsFor", { query: textSearch })
    : t("browseAllShots");

  const handleRemoveFilter = (filterId: number) => {
    const newSelectedFilters = selectedFilters.filter(id => id !== filterId);
    dispatch(setSelectedFilters(newSelectedFilters));
  };

  const handleRemoveSearch = () => {
    dispatch(setTextSearch(''));
  };

  return (
    <FilterChipBar
      contextText={contextText}
      filterChips={filterChips}
      onRemoveFilter={handleRemoveFilter}
      searchTerm={textSearch || undefined}
      onClearSearch={handleRemoveSearch}
    />
  );
};

export default Breadcrumb;
