"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import clsx from "clsx";
import { MentionTextboxProps, MentionTextboxRef, MentionItem } from "./types";
import { MentionDropdown } from "./MentionDropdown";

// Create a shared state object that persists across renders
// This is needed because TipTap's suggestion render() creates handlers once
interface SuggestionState {
  filteredItems: MentionItem[];
  highlightedIndex: number;
  command: ((props: { id: string; label: string }) => void) | null;
  setFilteredItems: (items: MentionItem[]) => void;
  setHighlightedIndex: (index: number | ((prev: number) => number)) => void;
  setDropdownOpen: (open: boolean) => void;
  setDropdownPosition: (pos: { top: number; left: number }) => void;
  setFilterQuery: (query: string) => void;
  mentionItems: MentionItem[];
}

/**
 * A reusable textbox component with @ mention capabilities using TipTap.
 * Supports inline chips for mentioning items like images, users, etc.
 */
export const MentionTextbox = forwardRef<MentionTextboxRef, MentionTextboxProps>(
  function MentionTextbox(
    {
      value,
      onChange,
      mentionItems,
      placeholder,
      disabled = false,
      minRows = 1,
      maxRows = 5,
      onSubmit,
      renderDropdownItem,
      className,
      onFocusChange,
      t = (key) => key,
      initialContent,
    },
    ref
  ) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [filterQuery, setFilterQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [filteredItems, setFilteredItems] = useState<MentionItem[]>([]);
    
    // Use a ref to hold the shared state that TipTap's suggestion handlers can access
    const stateRef = useRef<SuggestionState>({
      filteredItems: [],
      highlightedIndex: 0,
      command: null,
      setFilteredItems,
      setHighlightedIndex,
      setDropdownOpen,
      setDropdownPosition,
      setFilterQuery,
      mentionItems,
    });

    // Keep the state ref updated
    useEffect(() => {
      stateRef.current.filteredItems = filteredItems;
      stateRef.current.highlightedIndex = highlightedIndex;
      stateRef.current.mentionItems = mentionItems;
      stateRef.current.setFilteredItems = setFilteredItems;
      stateRef.current.setHighlightedIndex = setHighlightedIndex;
      stateRef.current.setDropdownOpen = setDropdownOpen;
      stateRef.current.setDropdownPosition = setDropdownPosition;
      stateRef.current.setFilterQuery = setFilterQuery;
    });

    // Calculate line height for min/max rows
    // Account for py-2 padding (8px top + 8px bottom = 16px)
    const lineHeight = 24;
    const padding = 16;
    const minHeight = minRows * lineHeight + padding;
    const maxHeight = maxRows * lineHeight + padding;

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          // Disable features we don't need
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Placeholder.configure({
          placeholder: placeholder || "",
          emptyEditorClass: "is-editor-empty",
        }),
        Mention.configure({
          HTMLAttributes: {
            class: "mention-chip",
          },
          renderHTML({ node }) {
            const item = stateRef.current.mentionItems.find((i) => i.id === node.attrs.id);
            const thumbnail = item?.thumbnail;
            
            if (thumbnail) {
              return [
                "span",
                { 
                  class: "mention-chip",
                  "data-mention-id": node.attrs.id,
                  "data-mention-label": node.attrs.label,
                },
                ["img", { src: thumbnail, alt: "", class: "mention-chip-thumbnail" }],
                ["span", { class: "mention-chip-label" }, node.attrs.label],
              ];
            }
            
            return [
              "span",
              { 
                class: "mention-chip",
                "data-mention-id": node.attrs.id,
                "data-mention-label": node.attrs.label,
              },
              `@${node.attrs.label}`,
            ];
          },
          suggestion: {
            char: "@",
            items: ({ query }: { query: string }) => {
              const items = stateRef.current.mentionItems;
              if (!query) return items;
              return items.filter((item) =>
                item.label.toLowerCase().includes(query.toLowerCase())
              );
            },
            render: () => {
              return {
                onStart: (props: SuggestionProps<MentionItem>) => {
                  const state = stateRef.current;
                  const items = props.items as MentionItem[];
                  state.setFilteredItems(items);
                  state.setFilterQuery(props.query);
                  state.setHighlightedIndex(0);
                  state.command = props.command;
                  
                  if (props.clientRect) {
                    const rect = props.clientRect();
                    if (rect) {
                      state.setDropdownPosition({
                        top: rect.bottom + window.scrollY,
                        left: rect.left + window.scrollX,
                      });
                    }
                  }
                  
                  state.setDropdownOpen(items.length > 0 || state.mentionItems.length === 0);
                },
                onUpdate: (props: SuggestionProps<MentionItem>) => {
                  const state = stateRef.current;
                  const items = props.items as MentionItem[];
                  state.setFilteredItems(items);
                  state.setFilterQuery(props.query);
                  state.setHighlightedIndex(0);
                  state.command = props.command;
                  
                  if (props.clientRect) {
                    const rect = props.clientRect();
                    if (rect) {
                      state.setDropdownPosition({
                        top: rect.bottom + window.scrollY,
                        left: rect.left + window.scrollX,
                      });
                    }
                  }
                  
                  state.setDropdownOpen(true);
                },
                onKeyDown: (props: SuggestionKeyDownProps) => {
                  const state = stateRef.current;
                  
                  if (props.event.key === "Escape") {
                    state.setDropdownOpen(false);
                    return true;
                  }
                  
                  if (props.event.key === "ArrowDown") {
                    const len = state.filteredItems.length;
                    if (len > 0) {
                      const newIndex = state.highlightedIndex < len - 1 
                        ? state.highlightedIndex + 1 
                        : 0;
                      state.highlightedIndex = newIndex;
                      state.setHighlightedIndex(newIndex);
                    }
                    return true;
                  }
                  
                  if (props.event.key === "ArrowUp") {
                    const len = state.filteredItems.length;
                    if (len > 0) {
                      const newIndex = state.highlightedIndex > 0 
                        ? state.highlightedIndex - 1 
                        : len - 1;
                      state.highlightedIndex = newIndex;
                      state.setHighlightedIndex(newIndex);
                    }
                    return true;
                  }
                  
                  if (props.event.key === "Enter" || props.event.key === "Tab") {
                    const items = state.filteredItems;
                    const idx = state.highlightedIndex;
                    if (items[idx] && state.command) {
                      const item = items[idx];
                      state.command({ id: item.id, label: item.label });
                      return true;
                    }
                  }
                  
                  return false;
                },
                onExit: () => {
                  const state = stateRef.current;
                  state.setDropdownOpen(false);
                  state.setFilterQuery("");
                  state.setHighlightedIndex(0);
                  state.command = null;
                },
              };
            },
          },
        }),
      ],
      // Use initialContent if provided, otherwise empty
      content: initialContent || "",
      editable: !disabled,
      onUpdate: ({ editor }) => {
        const text = editor.getText();
        const mentions: MentionItem[] = [];
        
        editor.state.doc.descendants((node) => {
          if (node.type.name === "mention") {
            const item = stateRef.current.mentionItems.find((i) => i.id === node.attrs.id);
            if (item) {
              mentions.push(item);
            } else {
              mentions.push({
                id: node.attrs.id,
                type: "unknown",
                label: node.attrs.label,
              });
            }
          }
        });
        
        onChange(text, mentions);
      },
      onFocus: () => {
        onFocusChange?.(true);
      },
      onBlur: ({ event }) => {
        // Don't trigger blur if clicking on the dropdown
        const relatedTarget = event?.relatedTarget as Element | null;
        if (relatedTarget?.closest("[data-mention-dropdown]")) {
          return;
        }
        onFocusChange?.(false);
      },
      editorProps: {
        handleKeyDown: (view, event) => {
          // Handle Enter to submit (when dropdown is not open)
          if (event.key === "Enter" && !event.shiftKey && !dropdownOpen) {
            event.preventDefault();
            onSubmit?.();
            return true;
          }
          return false;
        },
        attributes: {
          class: clsx(
            "outline-none px-3 py-2 text-base",
            "whitespace-pre-wrap break-words",
            disabled && "opacity-50 cursor-not-allowed"
          ),
          style: `min-height: ${minHeight}px; max-height: ${maxHeight}px;`,
        },
      },
    });

    // Sync external value changes (only when value is empty to clear)
    useEffect(() => {
      if (!editor) return;
      
      if (value === "" && editor.getText() !== "") {
        editor.commands.clearContent();
      }
    }, [value, editor]);

    // Update editor editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [disabled, editor]);

    // Handle dropdown item selection - refocus editor after selection
    const handleSelectItem = useCallback((item: MentionItem) => {
      if (stateRef.current.command) {
        stateRef.current.command({ id: item.id, label: item.label });
      }
      setDropdownOpen(false);
      // Refocus the editor after selection
      setTimeout(() => {
        editor?.commands.focus();
      }, 0);
    }, [editor]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      insertMention: (item: MentionItem) => {
        if (editor) {
          editor
            .chain()
            .focus()
            .insertContent({
              type: "mention",
              attrs: { id: item.id, label: item.label },
            })
            .insertContent(" ")
            .run();
        }
      },
      insertText: (text: string) => {
        if (editor) {
          // If there's existing content, add a space before the new text
          const hasContent = editor.getText().trim().length > 0;
          const textToInsert = hasContent ? ` ${text}` : text;
          editor
            .chain()
            .focus()
            .command(({ tr, state }) => {
              // Move cursor to end of document
              tr.setSelection(state.selection.constructor.atEnd(state.doc));
              return true;
            })
            .insertContent(textToInsert)
            .run();
        }
      },
      focus: () => {
        editor?.commands.focus();
      },
      getMentions: () => {
        const mentions: MentionItem[] = [];
        editor?.state.doc.descendants((node) => {
          if (node.type.name === "mention") {
            const item = stateRef.current.mentionItems.find((i) => i.id === node.attrs.id);
            if (item) {
              mentions.push(item);
            }
          }
        });
        return mentions;
      },
      getJSON: () => {
        return editor?.getJSON() || null;
      },
      setContent: (content) => {
        if (editor) {
          editor.commands.setContent(content);
        }
      },
    }), [editor]);

    return (
      <div className={clsx("relative", className)}>
        <EditorContent
          editor={editor}
          className={clsx(
            "[&_.ProseMirror]:outline-none",
            // Use auto overflow - only scroll when content exceeds max-height
            "[&_.ProseMirror]:overflow-y-auto",
            "[&_.ProseMirror]:overflow-x-hidden",
            // Hide scrollbar by default, show only on hover
            "[&_.ProseMirror::-webkit-scrollbar]:w-0",
            "[&_.ProseMirror::-webkit-scrollbar]:bg-transparent",
            "[&_.ProseMirror:hover::-webkit-scrollbar]:w-1.5",
            "[&_.ProseMirror::-webkit-scrollbar-track]:bg-transparent",
            "[&_.ProseMirror::-webkit-scrollbar-thumb]:bg-transparent",
            "[&_.ProseMirror:hover::-webkit-scrollbar-thumb]:bg-default-300",
            "[&_.ProseMirror::-webkit-scrollbar-thumb]:rounded-full",
            // Firefox scrollbar
            "[&_.ProseMirror]:scrollbar-width-none",
            "[&_.ProseMirror:hover]:scrollbar-width-thin",
            // Mention chip styles
            "[&_.mention-chip]:inline-flex [&_.mention-chip]:items-center",
            "[&_.mention-chip]:bg-default-100 [&_.mention-chip]:rounded-full",
            "[&_.mention-chip]:px-2 [&_.mention-chip]:py-0.5 [&_.mention-chip]:mx-0.5",
            "[&_.mention-chip]:text-xs [&_.mention-chip]:align-middle",
            "[&_.mention-chip]:border [&_.mention-chip]:border-divider",
            "[&_.mention-chip-thumbnail]:w-4 [&_.mention-chip-thumbnail]:h-4",
            "[&_.mention-chip-thumbnail]:rounded-sm [&_.mention-chip-thumbnail]:object-cover",
            "[&_.mention-chip-thumbnail]:mr-1"
          )}
        />

        {/* Dropdown */}
        {dropdownOpen && (
          <MentionDropdown
            isOpen={dropdownOpen}
            items={filteredItems}
            filterQuery=""
            highlightedIndex={highlightedIndex}
            onSelect={handleSelectItem}
            onClose={() => setDropdownOpen(false)}
            position={dropdownPosition}
            renderItem={renderDropdownItem}
            t={t}
          />
        )}
      </div>
    );
  }
);

export default MentionTextbox;
