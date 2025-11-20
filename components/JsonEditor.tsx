"use client";

import { useEffect, useRef } from "react";
import JSONEditor, { JSONEditorOptions } from "jsoneditor";
import "jsoneditor/dist/jsoneditor.css";

interface JsonEditorProps {
  value: any;
  onChange: (value: any) => void;
  mode?: "tree" | "code" | "form" | "text" | "view";
  readOnly?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

export default function JsonEditor({
  value,
  onChange,
  mode = "code",
  readOnly = false,
  onValidationChange,
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<JSONEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const options: JSONEditorOptions = {
      mode,
      modes: ["code", "tree", "form", "text", "view"],
      onChange: () => {
        if (editorRef.current && !readOnly) {
          try {
            const updatedJson = editorRef.current.get();
            onChange(updatedJson);
            onValidationChange?.(true);
          } catch (error) {
            // Invalid JSON, don't update
            console.error("Invalid JSON:", error);
            onValidationChange?.(false);
          }
        }
      },
      onModeChange: (newMode) => {
        // Optional: handle mode changes
      },
      onError: (error) => {
        console.error("JSON Editor error:", error);
        onValidationChange?.(false);
      },
      statusBar: true,
      navigationBar: true,
      search: true,
      mainMenuBar: !readOnly,
      enableSort: !readOnly,
      enableTransform: !readOnly,
    };

    editorRef.current = new JSONEditor(containerRef.current, options);
    editorRef.current.set(value);

    // Validate initial value
    try {
      editorRef.current.get();
      onValidationChange?.(true);
    } catch (error) {
      onValidationChange?.(false);
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  // Update editor when value changes externally
  useEffect(() => {
    if (editorRef.current) {
      try {
        const currentValue = editorRef.current.get();
        if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
          editorRef.current.set(value);
        }
      } catch (error) {
        // If current value is invalid, just set the new value
        editorRef.current.set(value);
      }
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="json-editor-container"
      style={{ height: "100%", width: "100%" }}
    />
  );
}
