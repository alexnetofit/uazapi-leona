import { NextRequest, NextResponse } from "next/server";
import { getWebhookUrl, setWebhookUrl } from "@/lib/kv";

export async function GET() {
  try {
    const url = await getWebhookUrl();
    return NextResponse.json({ url: url || "" });
  } catch (error) {
    console.error("Erro ao buscar webhook URL:", error);
    return NextResponse.json(
      { error: "Erro ao buscar webhook URL" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (url === undefined) {
      return NextResponse.json(
        { error: "URL é obrigatória" },
        { status: 400 }
      );
    }

    // Validar URL se não estiver vazia
    if (url && url.trim()) {
      try {
        new URL(url.trim());
      } catch {
        return NextResponse.json(
          { error: "URL inválida" },
          { status: 400 }
        );
      }
    }

    await setWebhookUrl(url.trim());
    return NextResponse.json({ success: true, message: "Webhook URL atualizada" });
  } catch (error) {
    console.error("Erro ao atualizar webhook URL:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar webhook URL" },
      { status: 500 }
    );
  }
}
