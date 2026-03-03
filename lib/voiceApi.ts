export type VoiceToTextResponse = {
  text: string;
};

type VoiceErrorPayload = {
  error?: string;
  details?: unknown;
};

export async function transcribeAudio(audioBlob: Blob, language: string): Promise<VoiceToTextResponse> {
  const formData = new FormData();
  const mimeType = audioBlob.type || "audio/webm";
  const extension =
    mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mpeg") ? "mp3" : "webm";
  formData.append("audio", audioBlob, `recording.${extension}`);
  formData.append("language", language);

  const response = await fetch("/api/voice-to-text", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<VoiceToTextResponse> & VoiceErrorPayload;

  if (!response.ok) {
    const details =
      payload.details && typeof payload.details === "object" ? ` ${JSON.stringify(payload.details)}` : "";
    throw new Error(payload.error ? `${payload.error}${details}` : `Failed to transcribe audio (HTTP ${response.status}).`);
  }

  if (!payload.text || typeof payload.text !== "string") {
    throw new Error("Invalid transcription response.");
  }

  return { text: payload.text };
}
