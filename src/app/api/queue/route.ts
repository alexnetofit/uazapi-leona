import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/kv";
import { fetchAllInstances, getInstanceNumber } from "@/lib/uazapi";
import { getUserRole } from "@/lib/api-auth";

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
    const body = await request.json();
    const { action, server, number, instanceToken } = body;

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
      return handleCheckQueue(server, token);
    }

    if (action === "reduce-delay") {
      return handleReduceDelay(server, token);
    }

    if (action === "reset-instance") {
      return handleResetInstance(server, token);
    }

    if (action === "clear-queue") {
      const role = getUserRole(request);
      if (role !== "admin") {
        return NextResponse.json(
          { error: "Acesso restrito ao administrador" },
          { status: 403 }
        );
      }
      return handleClearQueue(server, token);
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

async function handleCheckQueue(serverName: string, instanceToken: string) {
  const res = await fetch(
    `https://${serverName}.uazapi.com/message/async`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        token: instanceToken,
      },
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: `Erro ao verificar fila (${res.status})`, details: data },
      { status: res.status }
    );
  }

  const q = data.queue || data;

  return NextResponse.json({
    success: true,
    pending: q.pending ?? 0,
    status: q.status ?? "unknown",
    processingNow: q.processingNow ?? false,
    sessionReady: q.sessionReady ?? false,
    resetting: q.resetting ?? false,
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

async function handleResetInstance(serverName: string, instanceToken: string) {
  const res = await fetch(
    `https://${serverName}.uazapi.com/instance/reset`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        token: instanceToken,
      },
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: "Erro ao reiniciar instância", details: data },
      { status: res.status }
    );
  }

  return NextResponse.json({ success: true, data });
}

async function handleClearQueue(serverName: string, instanceToken: string) {
  const res = await fetch(
    `https://${serverName}.uazapi.com/message/async`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        token: instanceToken,
      },
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: "Erro ao apagar fila", details: data },
      { status: res.status }
    );
  }

  return NextResponse.json({ success: true, data });
}
