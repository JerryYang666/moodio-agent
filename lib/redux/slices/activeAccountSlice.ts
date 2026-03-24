import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const STORAGE_KEY = "moodio:active-account";

export interface ActiveAccountState {
  accountType: "personal" | "team";
  accountId: string | null;
  teamName: string | null;
}

function loadFromStorage(): ActiveAccountState {
  if (typeof window === "undefined") {
    return { accountType: "personal", accountId: null, teamName: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.accountType === "team" && parsed.accountId) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { accountType: "personal", accountId: null, teamName: null };
}

const initialState: ActiveAccountState = loadFromStorage();

const activeAccountSlice = createSlice({
  name: "activeAccount",
  initialState,
  reducers: {
    setActiveAccount(state, action: PayloadAction<ActiveAccountState>) {
      state.accountType = action.payload.accountType;
      state.accountId = action.payload.accountId;
      state.teamName = action.payload.teamName;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(action.payload));
      }
    },
    resetToPersonal(state) {
      state.accountType = "personal";
      state.accountId = null;
      state.teamName = null;
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  },
});

export const { setActiveAccount, resetToPersonal } = activeAccountSlice.actions;
export default activeAccountSlice.reducer;
