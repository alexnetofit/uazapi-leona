import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { action, server, number, instanceToken } = await request.json();

    if (!server || !instanceToken) {
      return NextResponse.json(
        { error: "Servidor e token da instância são obrigatórios" },
        { status: 400 }
      );
    }

    if (action === "check") {
      return handleCheckQueue(server, instanceToken, number);
    }

    if (action === "reduce-delay") {
      return handleReduceDelay(server, instanceToken);
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("Erro na operação de fila:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}

async function handleCheckQueue(
  serverName: string,
  instanceToken: string,
  number: string
) {
  if (!number) {
    return NextResponse.json(
      { error: "Número é obrigatório" },
      { status: 400 }
    );
  }

  const url = `https://${serverName}.uazapi.com/send/text`;
  const body = { number, text: "teste envio", async: true };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: instanceToken,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: `Erro ao verificar fila (${res.status})`, details: data, request: { url, body } },
      { status: res.status }
    );
  }

  return NextResponse.json({
    success: true,
    queuePosition: data.queuePosition ?? null,
    data,
  });
}

async function handleReduceDelay(serverName: string, instanceToken: string) {
  const res = await fetch(
    `https://${serverName}.uazapi.com/instance/updateDelaySettings`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: instanceToken,
      },
      body: JSON.stringify({
        msg_delay_min: 0,
        msg_delay_max: 1,
      }),
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: "Erro ao reduzir delay", details: data },
      { status: res.status }
    );
  }

  return NextResponse.json({ success: true, data });
}
