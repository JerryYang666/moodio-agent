'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter, usePathname } from 'next/navigation';
import { Input } from '@heroui/input';
import { Search, ImagePlus, X, Loader2 } from 'lucide-react';
import type { RootState } from '@/lib/redux/store';
import { setTextSearch, setSelectedFilters } from '@/lib/redux/slices/querySlice';
import { useImageSearch } from '@/hooks/use-image-search';
import type { AssetSummary } from '@/components/chat/asset-picker-modal';

// Heavy modal — only load when the user opens the image-search picker
const AssetPickerModal = dynamic(() => import('@/components/chat/asset-picker-modal'), {
  ssr: false,
});

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  initialDisplayValue?: string;
  clearFiltersOnSearch?: boolean;
  onSearchOverride?: (term: string) => void;
  /** Browse page only — show the image-search button and active-image chip */
  enableImageSearch?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = "",
  className = "",
  initialDisplayValue,
  clearFiltersOnSearch = false,
  onSearchOverride,
  enableImageSearch = false,
}) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();

  // Get current search text from Redux
  const searchText = useSelector((state: RootState) => state.query.textSearch);
  const imageSearchUploadId = useSelector(
    (state: RootState) => state.query.imageSearchUploadId
  );
  const imageSearchPreviewUrl = useSelector(
    (state: RootState) => state.query.imageSearchPreviewUrl
  );

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { searchByFile, searchByUrl, clear: clearImage, isUploading } = useImageSearch();

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

  const handleAssetSelect = async (asset: AssetSummary) => {
    setIsPickerOpen(false);
    if (clearFiltersOnSearch) {
      dispatch(setSelectedFilters([]));
    }
    if (pathname !== '/browse') {
      router.push('/browse');
    }
    setLocalSearchText('');
    await searchByUrl(asset.imageUrl);
  };

  const handleAssetUpload = async (files: File[]) => {
    setIsPickerOpen(false);
    const file = files[0];
    if (!file) return;
    if (clearFiltersOnSearch) {
      dispatch(setSelectedFilters([]));
    }
    if (pathname !== '/browse') {
      router.push('/browse');
    }
    setLocalSearchText('');
    await searchByFile(file);
  };

  const hasActiveImageSearch = !!imageSearchUploadId;
  const showImageButton = enableImageSearch && !hasActiveImageSearch;

  return (
    <div className={className}>
      <Input
        type="text"
        value={localSearchText}
        onValueChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder={hasActiveImageSearch ? 'Searching by image…' : placeholder}
        isDisabled={hasActiveImageSearch}
        startContent={
          hasActiveImageSearch && imageSearchPreviewUrl ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSearchPreviewUrl}
                alt="Image search preview"
                className="h-7 w-7 rounded object-cover ring-1 ring-default-200"
              />
              <span className="text-xs text-default-500 hidden sm:inline">
                Image search
              </span>
              <button
                type="button"
                aria-label="Clear image search"
                onClick={clearImage}
                className="rounded-full p-0.5 text-default-500 hover:bg-default-100 hover:text-default-700"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <Search size={18} className="text-default-400" />
          )
        }
        endContent={
          showImageButton ? (
            <button
              type="button"
              aria-label="Search by image"
              title="Search by image"
              onClick={() => setIsPickerOpen(true)}
              disabled={isUploading}
              className="flex items-center justify-center rounded-md p-1.5 text-default-500 hover:bg-default-100 hover:text-default-700 disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ImagePlus size={18} />
              )}
            </button>
          ) : null
        }
        variant="bordered"
        size="lg"
        classNames={{
          input: "text-sm",
          inputWrapper: "bg-background",
        }}
      />

      {enableImageSearch && isPickerOpen && (
        <AssetPickerModal
          isOpen={isPickerOpen}
          onOpenChange={() => setIsPickerOpen(false)}
          onSelect={handleAssetSelect}
          onUpload={handleAssetUpload}
          acceptTypes={["image"]}
        />
      )}
    </div>
  );
};

export default SearchBar;
