export interface UserSettings {
  cnMode?: boolean;
}

export const DEFAULT_USER_SETTINGS: Required<UserSettings> = {
  cnMode: false,
};

export const VALID_SETTINGS_KEYS = Object.keys(DEFAULT_USER_SETTINGS) as Array<keyof UserSettings>;

export interface UserSettingsContextValue {
  getSetting<K extends keyof UserSettings>(key: K): Required<UserSettings>[K];
  settings: Required<UserSettings>;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  isLoaded: boolean;
  isLoading: boolean;
}

export interface UserSettingsResponse {
  settings: Required<UserSettings>;
}
