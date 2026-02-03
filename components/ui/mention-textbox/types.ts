import { ReactNode } from "react";
import type { JSONContent } from "@tiptap/react";

/**
 * Represents a mentionable item that can be inserted as a chip.
 * Generic interface to support different mention types (images, users, collections, etc.)
 */
export interface MentionItem {
  /** Unique identifier for the item */
  id: string;
  /** Type of mention (e.g., "image", "user", "collection") */
  type: string;
  /** Display text for the mention */
  label: string;
  /** Optional thumbnail URL for visual display */
  thumbnail?: string;
  /** Type-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a mention that has been inserted into the text
 */
export interface InsertedMention {
  /** The mention item that was inserted */
  item: MentionItem;
  /** Position in the text where the mention appears (for serialization) */
  position?: number;
}

/**
 * Props for the MentionTextbox component
 */
export interface MentionTextboxProps {
  /** Current text value (plain text with mention placeholders) */
  value: string;
  /** Callback when content changes */
  onChange: (value: string, mentions: MentionItem[]) => void;
  /** Available items that can be mentioned */
  mentionItems: MentionItem[];
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Minimum number of rows to display */
  minRows?: number;
  /** Maximum number of rows before scrolling */
  maxRows?: number;
  /** Callback when Enter is pressed (without Shift) */
  onSubmit?: () => void;
  /** Custom renderer for chips */
  renderChip?: (item: MentionItem) => ReactNode;
  /** Custom renderer for dropdown items */
  renderDropdownItem?: (item: MentionItem, isHighlighted: boolean) => ReactNode;
  /** Additional CSS class names */
  className?: string;
  /** Callback when focus state changes */
  onFocusChange?: (focused: boolean) => void;
  /** Translation function for i18n */
  t?: (key: string) => string;
  /** Initial editor content (JSON format or plain text string) for restoring drafts */
  initialContent?: JSONContent | string | null;
}

/**
 * Ref handle for MentionTextbox to allow programmatic insertion
 */
export interface MentionTextboxRef {
  /** Insert a mention at the current cursor position */
  insertMention: (item: MentionItem) => void;
  /** Insert plain text at the current cursor position (or append if no cursor) */
  insertText: (text: string) => void;
  /** Focus the input */
  focus: () => void;
  /** Get the current mentions in the content */
  getMentions: () => MentionItem[];
  /** Get the editor content as JSON (for draft saving) */
  getJSON: () => JSONContent | null;
  /** Set the editor content from JSON (for draft loading) */
  setContent: (content: JSONContent) => void;
}

/**
 * Props for the MentionDropdown component
 */
export interface MentionDropdownProps {
  /** Whether the dropdown is visible */
  isOpen: boolean;
  /** Available items to show */
  items: MentionItem[];
  /** Current filter query (text after @) */
  filterQuery: string;
  /** Currently highlighted index for keyboard navigation */
  highlightedIndex: number;
  /** Callback when an item is selected */
  onSelect: (item: MentionItem) => void;
  /** Callback when dropdown should close */
  onClose: () => void;
  /** Position for the dropdown */
  position: { top: number; left: number };
  /** Custom renderer for items */
  renderItem?: (item: MentionItem, isHighlighted: boolean) => ReactNode;
  /** Translation function for i18n */
  t?: (key: string) => string;
}

/**
 * Props for the MentionChip component
 */
export interface MentionChipProps {
  /** The mention item to display */
  item: MentionItem;
  /** Whether the chip can be removed */
  removable?: boolean;
  /** Callback when remove is clicked */
  onRemove?: () => void;
  /** Additional CSS class names */
  className?: string;
}
