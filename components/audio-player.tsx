"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Download, Music } from "lucide-react";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface AudioPlayerProps {
  src: string;
  title?: string;
  variant?: "compact" | "full";
  autoPlay?: boolean;
  onDownload?: () => void;
}

export default function AudioPlayer({
  src,
  title,
  variant = "full",
  autoPlay = false,
  onDownload,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onLoadedMetadata = () => setDuration(el.duration);
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("ended", onEnded);

    if (el.duration) setDuration(el.duration);

    return () => {
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [autoPlay]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const el = audioRef.current;
      if (!el) return;
      if (playing) {
        el.pause();
        setPlaying(false);
      } else {
        el.play().then(() => setPlaying(true)).catch(() => {});
      }
    },
    [playing],
  );

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const el = audioRef.current;
      const bar = progressRef.current;
      if (!el || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
      setCurrentTime(el.currentTime);
    },
    [duration],
  );

  const progress = duration > 0 ? currentTime / duration : 0;

  if (variant === "compact") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-4">
        <audio ref={audioRef} src={src} preload="metadata" />
        <Music size={32} className="text-violet-400" />
        <button
          type="button"
          className="w-10 h-10 rounded-full bg-violet-500 hover:bg-violet-400 text-white flex items-center justify-center transition-colors cursor-pointer"
          onClick={togglePlay}
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="w-full max-w-[140px] flex flex-col items-center gap-1">
          <div
            ref={progressRef}
            className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden cursor-pointer"
            onClick={seek}
          >
            <div
              className="h-full bg-violet-400 rounded-full transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {duration > 0 && (
            <span className="text-[10px] text-white/60">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-5 rounded-xl bg-linear-to-br from-violet-500/20 to-purple-600/20 py-10 px-6">
      <audio ref={audioRef} src={src} preload="metadata" />
      <Music size={56} className="text-violet-400" />
      {title && (
        <p className="text-sm font-medium text-default-700 text-center truncate max-w-full">
          {title}
        </p>
      )}
      <div className="flex items-center gap-4 w-full max-w-md">
        <button
          type="button"
          className="w-12 h-12 shrink-0 rounded-full bg-violet-500 hover:bg-violet-400 text-white flex items-center justify-center transition-colors cursor-pointer"
          onClick={togglePlay}
        >
          {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>
        <div className="flex-1 flex flex-col gap-1">
          <div
            ref={progressRef}
            className="w-full h-2 rounded-full bg-white/20 overflow-hidden cursor-pointer"
            onClick={seek}
          >
            <div
              className="h-full bg-violet-400 rounded-full transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-default-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      {onDownload && (
        <button
          type="button"
          className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <Download size={16} />
          Download
        </button>
      )}
    </div>
  );
}
