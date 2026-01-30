import { configureStore } from "@reduxjs/toolkit";
import queryReducer from "./slices/querySlice";
import uiReducer from "./slices/uiSlice";
import { api } from "./services/api";

export const store = configureStore({
  reducer: {
    query: queryReducer,
    ui: uiReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
