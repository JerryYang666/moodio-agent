export interface UserSettings {
  cnMode?: boolean;
  birthYear?: number | null;
  languagePreference?: string | null;
  creativeGoals?: string[];
  userRole?: string | null;
  experienceLevel?: string | null;
  mainGoal?: string | null;
  communicationTone?: string | null;
  explanationDepth?: string | null;
  personalizationCompleted?: boolean;
  // When true, the chat input's image-upload + voice buttons auto-stack
  // vertically once the textarea grows tall enough. Opt-in because the
  // adaptive layout has a history of edge-case flicker at certain widths.
  stackChatInputButtons?: boolean;
}

export const DEFAULT_USER_SETTINGS: Required<UserSettings> = {
  cnMode: false,
  birthYear: null,
  languagePreference: null,
  creativeGoals: [],
  userRole: null,
  experienceLevel: null,
  mainGoal: null,
  communicationTone: null,
  explanationDepth: null,
  personalizationCompleted: false,
  stackChatInputButtons: false,
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
