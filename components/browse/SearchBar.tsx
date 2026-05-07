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
  const imageSearchPending = useSelector(
    (state: RootState) => state.query.imageSearchPending
  );

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { searchByFile, searchByLibraryAsset, clear: clearImage } = useImageSearch();

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
    await searchByLibraryAsset({ imageId: asset.imageId, imageUrl: asset.imageUrl });
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

  // "Active" covers both the in-flight upload (pending) and the resolved
  // upload_id state. Both render the chip control instead of a text input
  // so the X button is always interactive.
  const isImageSearchActive =
    enableImageSearch && (imageSearchPending || !!imageSearchUploadId);

  return (
    <div className={className}>
      {isImageSearchActive ? (
        <ImageSearchChip
          previewUrl={imageSearchPreviewUrl}
          isPending={!!imageSearchPending}
          onClear={clearImage}
        />
      ) : (
        <Input
          type="text"
          value={localSearchText}
          onValueChange={handleInputChange}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          startContent={<Search size={18} className="text-default-400" />}
          endContent={
            enableImageSearch ? (
              <button
                type="button"
                aria-label="Search by image"
                title="Search by image"
                onClick={() => setIsPickerOpen(true)}
                className="flex items-center justify-center rounded-md p-1.5 text-default-500 hover:bg-default-100 hover:text-default-700"
              >
                <ImagePlus size={18} />
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
      )}

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

interface ImageSearchChipProps {
  previewUrl: string | null | undefined;
  isPending: boolean;
  onClear: () => void;
}

// Custom control that mimics the bordered Input shell but stays fully
// interactive — most importantly, the clear button is always clickable
// even while the upload is in flight.
function ImageSearchChip({ previewUrl, isPending, onClear }: ImageSearchChipProps) {
  return (
    <div
      className="relative flex h-12 w-full items-center gap-3 rounded-medium border-2 border-default-200 bg-background px-3"
      role="group"
      aria-label="Image search"
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded ring-1 ring-default-200">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Image search preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-default-100" />
        )}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 size={14} className="animate-spin text-white" />
          </div>
        )}
      </div>
      <span className="flex-1 truncate text-sm text-default-600">
        {isPending ? "Uploading image…" : "Searching by image"}
      </span>
      <button
        type="button"
        aria-label="Clear image search"
        onClick={onClear}
        className="flex h-7 w-7 items-center justify-center rounded-full text-default-500 hover:bg-default-100 hover:text-default-700"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default SearchBar;
