import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAdmin } from "@/lib/api-auth";

const GROUPS_API_URL =
  process.env.GROUPS_API_URL || "https://leona01.uazapi.com";
const GROUPS_API_TOKEN = process.env.GROUPS_API_TOKEN || "";

function detectMediaType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (!GROUPS_API_TOKEN) {
    return NextResponse.json(
      { error: "GROUPS_API_TOKEN não configurado" },
      { status: 500 }
    );
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return handleMedia(request);
  }

  return handleText(request);
}

async function handleText(request: NextRequest) {
  try {
    const { group, text } = await request.json();

    if (!group || !text?.trim()) {
      return NextResponse.json(
        { error: "Grupo e mensagem são obrigatórios" },
        { status: 400 }
      );
    }

    const res = await fetch(`${GROUPS_API_URL}/send/text`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: GROUPS_API_TOKEN,
      },
      body: JSON.stringify({ number: group, text: text.trim() }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro ao enviar mensagem", details: data },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Erro ao enviar texto:", error);
    return NextResponse.json(
      { error: "Erro interno ao enviar mensagem" },
      { status: 500 }
    );
  }
}

async function handleMedia(request: NextRequest) {
  let blobUrl: string | null = null;

  try {
    const formData = await request.formData();
    const group = formData.get("group") as string;
    const file = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string) || "";

    if (!group || !file) {
      return NextResponse.json(
        { error: "Grupo e arquivo são obrigatórios" },
        { status: 400 }
      );
    }

    const blob = await put(`groups/${Date.now()}-${file.name}`, file, {
      access: "public",
    });
    blobUrl = blob.url;

    const mediaType = detectMediaType(file.type);

    const body: Record<string, unknown> = {
      number: group,
      type: mediaType,
      async: true,
      file: blobUrl,
    };

    if (caption.trim()) {
      body.text = caption.trim();
    }

    const res = await fetch(`${GROUPS_API_URL}/send/media`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: GROUPS_API_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    await del(blobUrl).catch((err: unknown) =>
      console.error("Erro ao deletar blob:", err)
    );
    blobUrl = null;

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro ao enviar mídia", details: data, blobUrl: blob.url, sentBody: body },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, data, blobUrl: blob.url, sentBody: body });
  } catch (error) {
    if (blobUrl) {
      await del(blobUrl).catch((err: unknown) =>
        console.error("Erro ao deletar blob no cleanup:", err)
      );
    }
    console.error("Erro ao enviar mídia:", error);
    return NextResponse.json(
      { error: "Erro interno ao enviar mídia" },
      { status: 500 }
    );
  }
}
