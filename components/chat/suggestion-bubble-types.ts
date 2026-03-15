import type { MenuState } from "./menu-configuration";
import type { PendingImage } from "./pending-image-types";
import type { PendingVideo } from "./pending-video-types";

/**
 * Actions a suggestion bubble can perform on the chat interface.
 * All fields are optional — only the specified fields are applied.
 */
export interface SuggestionBubbleAction {
  /** Text to insert into the prompt editor */
  promptText?: string;
  /** Partial MenuState overrides (e.g. { mode: "video" }) */
  menuState?: Partial<MenuState>;
  /** Images to add to the pending images area */
  pendingImages?: PendingImage[];
  /** Videos to add to the pending videos area */
  pendingVideos?: PendingVideo[];
  /** If true, automatically send the message after applying all actions */
  autoSend?: boolean;
}

/**
 * Context tag for where a suggestion bubble should appear.
 */
export type SuggestionBubbleContext =
  | "empty-chat"
  | "post-message"
  | "browse-video";

/**
 * A single suggestion bubble definition.
 */
export interface SuggestionBubble {
  /** Unique identifier */
  id: string;
  /** Display label shown on the bubble */
  label: string;
  /** Lucide icon name */
  icon?: string;
  /** Where this bubble should appear */
  contexts: SuggestionBubbleContext[];
  /** The action to perform when clicked */
  action: SuggestionBubbleAction;
}

/**
 * A factory for suggestion bubbles that depend on runtime data
 * (e.g. the specific video being viewed on the browse page).
 */
export type SuggestionBubbleFactory = (
  params: Record<string, any>
) => SuggestionBubble;

/** Unified custom event name for all suggestion bubble activations */
export const SUGGESTION_BUBBLE_EVENT = "suggestion-bubble-activate";

export interface SuggestionBubbleEventDetail {
  action: SuggestionBubbleAction;
}

/** Dispatch a suggestion bubble action via window CustomEvent */
export function dispatchSuggestionBubble(
  action: SuggestionBubbleAction
): void {
  window.dispatchEvent(
    new CustomEvent<SuggestionBubbleEventDetail>(SUGGESTION_BUBBLE_EVENT, {
      detail: { action },
    })
  );
}
