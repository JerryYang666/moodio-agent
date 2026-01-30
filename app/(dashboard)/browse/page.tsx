"use client";

import React, { useEffect } from "react";

// =============================================================================
// COMING SOON PLACEHOLDER
// Remove this section and uncomment the imports and BrowseContent below
// when the backend APIs are ready.
// =============================================================================

export default function BrowsePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-default-500">
      <h1 className="text-2xl font-bold">Browse</h1>
      <p>Coming soon...</p>
    </div>
  );
}

// =============================================================================
// ACTUAL BROWSE IMPLEMENTATION
// Uncomment everything below and remove the placeholder above when ready.
// =============================================================================

/*
import FilterMenu from "@/components/browse/FilterMenu";
import SearchBar from "@/components/browse/SearchBar";
import Breadcrumb from "@/components/browse/Breadcrumb";
import VideoGrid from "@/components/browse/VideoGrid";

// Disable body-level scrolling on this page to prevent double scrollbars
// The VirtualInfiniteScroll component handles all scrolling for the video grid
const useDisableBodyScroll = () => {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);
};

export default function BrowsePage() {
  // Disable body-level scrolling to ensure single scrollbar from VirtualInfiniteScroll
  useDisableBodyScroll();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <main className="flex-1 h-screen px-4 py-6 min-w-0 flex flex-col">
        <div className="mb-6 shrink-0">
          <SearchBar placeholder="Search videos..." />
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="mr-6 shrink-0 w-64 hidden lg:block">
            <FilterMenu />
          </div>
          
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="shrink-0">
              <Breadcrumb />
            </div>

            <VideoGrid />
          </div>
        </div>
      </main>
    </div>
  );
}
*/
