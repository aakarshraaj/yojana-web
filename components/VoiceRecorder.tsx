"use client";

import { useEffect, useRef, useState } from "react";
import { transcribeAudio } from "@/lib/voiceApi";

type VoiceRecorderProps = {
  language: string;
  disabled?: boolean;
  isDark?: boolean;
  embedded?: boolean;
  onError?: (message: string) => void;
  onTranscription: (text: string) => void;
};

function formatSeconds(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function VoiceRecorder({
  language,
  disabled = false,
  isDark = false,
  embedded = false,
  onError,
  onTranscription,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const stopStream = () => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setError(null);
    setElapsedSeconds(0);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice input is not supported in this browser.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setError("MediaRecorder is not supported in this browser.");
      return;
    }

    const preferredMimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const supportedMimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));

    if (!supportedMimeType) {
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopStream();
        setIsRecording(false);
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }

        if (chunksRef.current.length === 0) {
          setError("No audio captured. Please try again.");
          return;
        }

        try {
          setIsTranscribing(true);
          const blobType = recorder.mimeType || supportedMimeType;
          const audioBlob = new Blob(chunksRef.current, { type: blobType });
          const { text } = await transcribeAudio(audioBlob, language);
          onTranscription(text);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          chunksRef.current = [];
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      setError("Microphone permission denied or unavailable.");
      stopStream();
      setIsRecording(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const busy = disabled || isTranscribing;
  const statusText = isTranscribing ? "Transcribing" : isRecording ? `Listening ${formatSeconds(elapsedSeconds)}` : "Voice";

  useEffect(() => {
    if (!error || !onError) return;
    onError(error);
  }, [error, onError]);

  return (
    <div className={`flex flex-col ${embedded ? "items-start" : "items-end"} gap-1`}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={isRecording ? stopRecording : () => void startRecording()}
          disabled={busy}
          aria-label={isRecording ? "Stop recording" : "Start voice input"}
          className={`inline-flex items-center rounded-full border text-xs font-medium tracking-[0.01em] transition-all duration-300 ${
            embedded ? "h-9 w-9 justify-center px-0" : "h-9 gap-2 px-3"
          } ${
            isTranscribing
              ? isDark
                ? "border-[var(--ji-border)] bg-[var(--ji-surface-muted)] text-stone-200"
                : "border-slate-300 bg-slate-100 text-slate-700"
              : isRecording
                ? isDark
                  ? "border-[var(--ji-border-strong)] bg-[var(--ji-danger-surface)] text-[var(--ji-danger-text)]"
                  : "border-rose-300 bg-rose-50 text-rose-700 shadow-[0_6px_14px_rgba(244,63,94,0.12)]"
                : isDark
                  ? "border-[var(--ji-border)] bg-[var(--ji-surface)] text-stone-200 hover:border-[var(--ji-border-strong)]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          } ${busy ? "cursor-not-allowed opacity-75" : ""}`}
        >
          {isTranscribing ? (
            <span
              className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent ${
                isDark ? "opacity-90" : "opacity-70"
              }`}
            />
          ) : isRecording ? (
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${isDark ? "bg-[var(--ji-danger-text)]/45" : "bg-rose-500/55"}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isDark ? "bg-[var(--ji-danger-text)]" : "bg-rose-500"}`} />
            </span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
            </svg>
          )}
          {!embedded && <span className="whitespace-nowrap tabular-nums">{statusText}</span>}
          {isRecording && !embedded && (
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                isDark ? "bg-[var(--ji-danger-text)]/20 text-[var(--ji-danger-text)]" : "bg-rose-200/70 text-rose-700"
              }`}
            >
              <span className="h-2 w-2 rounded-[2px] bg-current" />
            </span>
          )}
        </button>
      </div>
      {error && !embedded && <span className={`max-w-[220px] text-[11px] text-right text-rose-500`}>{error}</span>}
    </div>
  );
}
