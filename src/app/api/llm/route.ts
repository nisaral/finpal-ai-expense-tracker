import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

export async function POST(req: NextRequest) {
  try {
    const { prompt, system, model = "mistral-small-latest", temperature = 0.2 } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "MISTRAL_API_KEY not configured" }, { status: 500 });
    }

    const body = {
      model,
      temperature,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      response_format: { type: "text" },
    } as const;

    const res = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || "LLM request failed" }, { status: 500 });
    }

    const content = data?.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content, raw: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Use POST with { prompt }" }, { status: 405 });
}