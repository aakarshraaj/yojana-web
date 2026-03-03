import { NextResponse } from "next/server";

const apiBaseUrl = (
  process.env.YOJANA_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:3001"
).replace(/\/+$/, "");

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && apiBaseUrl === origin.replace(/\/+$/, "")) {
      return NextResponse.json(
        {
          error:
            "Voice backend URL is misconfigured. Set YOJANA_API_BASE_URL (or NEXT_PUBLIC_API_BASE_URL) to your yojana-api server URL.",
        },
        { status: 500 }
      );
    }

    const incomingFormData = await request.formData();
    const audio = incomingFormData.get("audio");
    const language = incomingFormData.get("language");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }

    if (typeof language !== "string" || !language.trim()) {
      return NextResponse.json({ error: "Language is required." }, { status: 400 });
    }

    const formData = new FormData();
    const fileName = audio instanceof File && audio.name ? audio.name : "recording.webm";
    formData.append("audio", audio, fileName);
    formData.append("language", language);

    const response = await fetch(`${apiBaseUrl}/voice-to-text`, {
      method: "POST",
      body: formData,
    });

    const raw = await response.text();
    let payload: unknown = {};

    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { error: raw || "Unexpected response from voice service." };
    }

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process voice request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
