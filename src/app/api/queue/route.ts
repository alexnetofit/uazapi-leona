import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import { fetchAllInstances, getInstanceNumber } from "@/lib/uazapi";

async function resolveInstanceToken(
  serverName: string,
  number: string
): Promise<{ token: string; serverToken: string } | null> {
  const servers = await getServers();
  const srv = servers.find((s) => s.name === serverName);
  if (!srv) return null;

  const instances = await fetchAllInstances(srv.name, srv.token);
  const instance = instances.find((inst) => {
    const instNumber = getInstanceNumber(inst);
    return instNumber.includes(number) || number.includes(instNumber);
  });

  if (!instance?.token) return null;
  return { token: instance.token, serverToken: srv.token };
}

export async function POST(request: NextRequest) {
  try {
    const { action, server, number, instanceToken } = await request.json();

    if (!server || !number) {
      return NextResponse.json(
        { error: "Servidor e número são obrigatórios" },
        { status: 400 }
      );
    }

    let token = instanceToken;

    if (!token) {
      const resolved = await resolveInstanceToken(server, number);
      if (!resolved) {
        return NextResponse.json(
          { error: "Instância não encontrada no servidor" },
          { status: 404 }
        );
      }
      token = resolved.token;
    }

    if (action === "check") {
      return handleCheckQueue(server, token, number);
    }

    if (action === "reduce-delay") {
      return handleReduceDelay(server, token);
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
