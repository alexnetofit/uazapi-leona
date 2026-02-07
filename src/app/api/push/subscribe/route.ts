import { NextRequest, NextResponse } from "next/server";
import { addPushSubscription, removePushSubscription } from "@/lib/kv";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Subscription inválida" },
        { status: 400 }
      );
    }

    await addPushSubscription({ endpoint, keys });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar subscription:", error);
    return NextResponse.json(
      { error: "Erro ao salvar subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint é obrigatório" },
        { status: 400 }
      );
    }

    await removePushSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover subscription:", error);
    return NextResponse.json(
      { error: "Erro ao remover subscription" },
      { status: 500 }
    );
  }
}
