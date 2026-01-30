import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { UIState } from "../types";

const initialState: UIState = {
  showFilters: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setShowFilters: (state, action: PayloadAction<boolean>) => {
      state.showFilters = action.payload;
    },
    toggleShowFilters: (state) => {
      state.showFilters = !state.showFilters;
    },
  },
});

export const { setShowFilters, toggleShowFilters } = uiSlice.actions;
export default uiSlice.reducer;
