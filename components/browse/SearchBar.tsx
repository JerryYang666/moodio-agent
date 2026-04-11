'use client';

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter, usePathname } from 'next/navigation';
import { Input } from '@heroui/input';
import { Search } from 'lucide-react';
import type { RootState } from '@/lib/redux/store';
import { setTextSearch, setSelectedFilters } from '@/lib/redux/slices/querySlice';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  initialDisplayValue?: string;
  clearFiltersOnSearch?: boolean;
  onSearchOverride?: (term: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "",
  className = "",
  initialDisplayValue,
  clearFiltersOnSearch = false,
  onSearchOverride,
}) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();

  // Get current search text from Redux
  const searchText = useSelector((state: RootState) => state.query.textSearch);

  // Local state for input field (for continuous re-renders)
  // Use initialDisplayValue if provided (for HomePage), otherwise use Redux state
  const [localSearchText, setLocalSearchText] = useState(
    initialDisplayValue !== undefined ? initialDisplayValue : searchText
  );

  // Sync local state when Redux state changes (e.g., from reset or filter removal)
  // BUT don't sync if initialDisplayValue is explicitly set (HomePage case)
  useEffect(() => {
    if (initialDisplayValue === undefined) {
      setLocalSearchText(searchText);
    }
  }, [searchText, initialDisplayValue]);

  const handleInputChange = (value: string) => {
    setLocalSearchText(value);
  };

  const handleSearch = () => {
    if (onSearchOverride && localSearchText.trim()) {
      onSearchOverride(localSearchText);
      return;
    }

    if (clearFiltersOnSearch) {
      dispatch(setSelectedFilters([]));
    }

    // Update Redux state with the new search text
    dispatch(setTextSearch(localSearchText));

    // Navigate to browse if currently on a different page
    if (pathname !== '/browse') {
      router.push('/browse');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className={className}>
      <Input
        type="text"
        value={localSearchText}
        onValueChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        startContent={<Search size={18} className="text-default-400" />}
        variant="bordered"
        size="lg"
        classNames={{
          input: "text-sm",
          inputWrapper: "bg-background",
        }}
      />
    </div>
  );
};

export default SearchBar;
