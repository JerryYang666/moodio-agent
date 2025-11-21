"use client";

import { useContext } from "react";
import { CollectionsContext } from "@/components/collections-provider";

export function useCollections() {
  const context = useContext(CollectionsContext);

  if (context === undefined) {
    throw new Error("useCollections must be used within a CollectionsProvider");
  }

  return context;
}

