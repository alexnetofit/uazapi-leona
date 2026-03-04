import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const { action, server, number } = await request.json();

    const servers = await getServers();
    const srv = servers.find((s) => s.name === server);

    if (!srv) {
      return NextResponse.json(
        { error: "Servidor não encontrado" },
        { status: 404 }
      );
    }

    if (action === "check") {
      return handleCheckQueue(srv.name, srv.token, number);
    }

    if (action === "reduce-delay") {
      return handleReduceDelay(srv.name, srv.token);
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
  token: string,
  number: string
) {
  if (!number) {
    return NextResponse.json(
      { error: "Número é obrigatório" },
      { status: 400 }
    );
  }

  const res = await fetch(`https://${serverName}.uazapi.com/send/text`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({
      number,
      text: "teste envio",
      async: true,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: "Erro ao verificar fila", details: data },
      { status: res.status }
    );
  }

  return NextResponse.json({
    success: true,
    queuePosition: data.queuePosition ?? null,
    data,
  });
}

async function handleReduceDelay(serverName: string, token: string) {
  const res = await fetch(
    `https://${serverName}.uazapi.com/instance/updateDelaySettings`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token,
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
