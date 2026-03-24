import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface ActiveAccountState {
  accountType: "personal" | "team";
  accountId: string | null;
  teamName: string | null;
}

const initialState: ActiveAccountState = {
  accountType: "personal",
  accountId: null,
  teamName: null,
};

const activeAccountSlice = createSlice({
  name: "activeAccount",
  initialState,
  reducers: {
    /**
     * Optimistically update the local Redux state.
     * The caller (UI) is responsible for also firing the
     * setActiveAccount RTK Query mutation to persist to DB.
     */
    setActiveAccountLocal(state, action: PayloadAction<ActiveAccountState>) {
      state.accountType = action.payload.accountType;
      state.accountId = action.payload.accountId;
      state.teamName = action.payload.teamName;
    },
    resetToPersonalLocal(state) {
      state.accountType = "personal";
      state.accountId = null;
      state.teamName = null;
    },
  },
});

export const { setActiveAccountLocal, resetToPersonalLocal } = activeAccountSlice.actions;
export default activeAccountSlice.reducer;
