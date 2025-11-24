"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { siteConfig } from "@/config/site";
import { getSupportedMimeType, getFileExtension } from "./utils";

interface UseVoiceRecorderOptions {
  onTranscriptionComplete?: (text: string) => void;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { onTranscriptionComplete } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Check for max recording duration
  useEffect(() => {
    if (isRecording && recordingTime >= siteConfig.audioRecording.maxDuration) {
      stopRecording();
    }
  }, [recordingTime, isRecording]);

  const handleTranscription = useCallback(
    async (audioBlob: Blob, mimeType: string) => {
      setIsTranscribing(true);
      try {
        // Determine file extension based on MIME type
        const extension = getFileExtension(mimeType);
        const file = new File([audioBlob], `recording.${extension}`, {
          type: mimeType,
        });

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Transcription failed");
        }

        const data = await res.json();
        if (data.text) {
          onTranscriptionComplete?.(data.text);
        }
      } catch (error) {
        console.error("Transcription error:", error);
        alert("Failed to transcribe audio.");
      } finally {
        setIsTranscribing(false);
      }
    },
    [onTranscriptionComplete]
  );

  const startRecording = useCallback(async () => {
    try {
      // Check if MediaRecorder is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert(
          "Audio recording is not supported on this browser. Please use HTTPS or a supported browser."
        );
        return;
      }

      if (typeof MediaRecorder === "undefined") {
        alert("MediaRecorder is not supported on this browser.");
        return;
      }

      // Detect supported MIME type for iOS Safari compatibility
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        alert(
          "Audio recording format is not supported on this device. Please try a different browser."
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorderOptions = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        await handleTranscription(audioBlob, mimeType);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      if (error instanceof Error) {
        if (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        ) {
          alert(
            "Microphone permission denied. Please allow microphone access in your browser settings."
          );
        } else if (
          error.name === "NotFoundError" ||
          error.name === "DevicesNotFoundError"
        ) {
          alert(
            "No microphone found. Please connect a microphone and try again."
          );
        } else if (
          error.name === "NotReadableError" ||
          error.name === "TrackStartError"
        ) {
          alert("Microphone is already in use by another application.");
        } else {
          alert(`Unable to access microphone: ${error.message}`);
        }
      } else {
        alert(
          "Unable to access microphone. Please check permissions and try again."
        );
      }
    }
  }, [handleTranscription]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }
  }, [isRecording]);

  return {
    isRecording,
    isTranscribing,
    recordingTime,
    startRecording,
    stopRecording,
  };
}

