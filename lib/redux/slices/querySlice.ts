import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { QueryState } from "../types";

const initialState: QueryState = {
  textSearch: "",
  selectedFolders: [],
  selectedFilters: [],
  contentTypes: [],
  isAigc: undefined,
  cursor: null,
  searchId: null,
};

const querySlice = createSlice({
  name: "query",
  initialState,
  reducers: {
    setTextSearch: (state, action: PayloadAction<string>) => {
      state.textSearch = action.payload;
      // Reset pagination when search changes
      state.cursor = null;
      state.searchId = null;
    },
    setSelectedFolders: (state, action: PayloadAction<number[]>) => {
      state.selectedFolders = action.payload;
      // Reset pagination when filters change
      state.cursor = null;
      state.searchId = null;
    },
    setSelectedFilters: (state, action: PayloadAction<number[]>) => {
      state.selectedFilters = action.payload;
      // Reset pagination when filters change
      state.cursor = null;
      state.searchId = null;
    },
    setContentTypes: (state, action: PayloadAction<string[]>) => {
      state.contentTypes = action.payload;
      // Reset pagination when filter changes
      state.cursor = null;
      state.searchId = null;
    },
    setIsAigc: (state, action: PayloadAction<boolean | undefined>) => {
      state.isAigc = action.payload;
      // Reset pagination when filter changes
      state.cursor = null;
      state.searchId = null;
    },
    setFilters: (state, action: PayloadAction<{
      selectedFolders?: number[];
      selectedFilters?: number[];
      contentTypes?: string[];
      isAigc?: boolean | undefined;
    }>) => {
      if (action.payload.selectedFolders !== undefined) {
        state.selectedFolders = action.payload.selectedFolders;
      }
      if (action.payload.selectedFilters !== undefined) {
        state.selectedFilters = action.payload.selectedFilters;
      }
      if (action.payload.contentTypes !== undefined) {
        state.contentTypes = action.payload.contentTypes;
      }
      if (action.payload.isAigc !== undefined) {
        state.isAigc = action.payload.isAigc;
      }
      // Reset pagination when any filter changes
      state.cursor = null;
      state.searchId = null;
    },
    setCursor: (state, action: PayloadAction<string | null>) => {
      state.cursor = action.payload;
    },
    setSearchId: (state, action: PayloadAction<string | null>) => {
      state.searchId = action.payload;
    },
    setPagination: (state, action: PayloadAction<{ cursor: string | null; searchId: string | null }>) => {
      state.cursor = action.payload.cursor;
      state.searchId = action.payload.searchId;
    },
    clearFilters: (state) => {
      state.selectedFolders = [];
      state.selectedFilters = [];
      state.contentTypes = [];
      state.isAigc = undefined;
      // Reset pagination when filters change
      state.cursor = null;
      state.searchId = null;
    },
    resetQuery: (state) => {
      state.textSearch = "";
      state.selectedFolders = [];
      state.selectedFilters = [];
      state.contentTypes = [];
      state.isAigc = undefined;
      state.cursor = null;
      state.searchId = null;
    },
  },
});

export const {
  setTextSearch,
  setSelectedFolders,
  setSelectedFilters,
  setContentTypes,
  setIsAigc,
  setFilters,
  setCursor,
  setSearchId,
  setPagination,
  clearFilters,
  resetQuery,
} = querySlice.actions;

export default querySlice.reducer;
