import { NextRequest, NextResponse } from "next/server";
import { getServers, getConnectedInstances, getQueueData } from "@/lib/kv";
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

    if (action === "batch-check") {
      return handleBatchCheck(body.instances || []);
    }

    if (action === "batch-check-all") {
      return handleBatchCheckAll();
    }

    if (action === "restart-server") {
      if (!server) {
        return NextResponse.json(
          { error: "Servidor é obrigatório" },
          { status: 400 }
        );
      }
      const role = getUserRole(request);
      if (role !== "admin") {
        return NextResponse.json(
          { error: "Acesso restrito ao administrador" },
          { status: 403 }
        );
      }
      return handleRestartServer(server);
    }

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

    if (action === "webhook-errors") {
      return handleWebhookErrors(server, token);
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

async function handleBatchCheck(
  instances: { server: string; token: string; number: string }[]
) {
  const results = await Promise.allSettled(
    instances.map(async (inst) => {
      try {
        const res = await fetch(
          `https://${inst.server}.uazapi.com/message/async`,
          {
            method: "GET",
            headers: { Accept: "application/json", token: inst.token },
          }
        );
        if (!res.ok) return { number: inst.number, server: inst.server, error: true };
        const data = await res.json();
        const q = data.queue || data;
        return {
          number: inst.number,
          server: inst.server,
          pending: q.pending ?? 0,
          status: q.status ?? "unknown",
          processingNow: q.processingNow ?? false,
          sessionReady: q.sessionReady ?? false,
          resetting: q.resetting ?? false,
        };
      } catch {
        return { number: inst.number, server: inst.server, error: true };
      }
    })
  );

  const checked = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value);

  return NextResponse.json({ results: checked });
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
        msg_delay_max: 0,
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

const BATCH_CHECK_TIMEOUT_MS = 6000;

async function handleBatchCheckAll() {
  const cachedEntries = await getQueueData();

  if (cachedEntries.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const toCheck = cachedEntries.filter((e) => e.token);

  if (toCheck.length === 0) {
    return NextResponse.json({
      results: cachedEntries.map((e) => ({
        number: e.number,
        server: e.server,
        name: e.instanceName,
        token: e.token,
        pending: e.pending,
        status: e.status,
        processingNow: e.processingNow,
        sessionReady: e.sessionReady,
        resetting: e.resetting,
      })),
    });
  }

  const results = await Promise.allSettled(
    toCheck.map(async (entry) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BATCH_CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://${entry.server}.uazapi.com/message/async`,
          {
            method: "GET",
            headers: { Accept: "application/json", token: entry.token },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (!res.ok) {
          return {
            number: entry.number,
            server: entry.server,
            name: entry.instanceName,
            token: entry.token,
            pending: entry.pending,
            status: entry.status,
            processingNow: entry.processingNow,
            sessionReady: entry.sessionReady,
            resetting: entry.resetting,
          };
        }
        const data = await res.json();
        const q = data.queue || data;
        return {
          number: entry.number,
          server: entry.server,
          name: entry.instanceName,
          token: entry.token,
          pending: q.pending ?? 0,
          status: q.status ?? "unknown",
          processingNow: q.processingNow ?? false,
          sessionReady: q.sessionReady ?? false,
          resetting: q.resetting ?? false,
        };
      } catch {
        clearTimeout(timeout);
        return {
          number: entry.number,
          server: entry.server,
          name: entry.instanceName,
          token: entry.token,
          pending: entry.pending,
          status: entry.status,
          processingNow: entry.processingNow,
          sessionReady: entry.sessionReady,
          resetting: entry.resetting,
        };
      }
    })
  );

  const checked = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)
    .filter((r) => (r.pending as number) > 0);

  checked.sort((a, b) => (b.pending as number) - (a.pending as number));
  return NextResponse.json({ results: checked });
}

async function handleRestartServer(serverName: string) {
  const servers = await getServers();
  const server = servers.find((s) => s.name === serverName);
  if (!server) {
    return NextResponse.json(
      { error: "Servidor não encontrado" },
      { status: 404 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://${serverName}.uazapi.com/admin/restart`,
      {
        method: "POST",
        headers: { Accept: "application/json", AdminToken: server.token },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro ao reiniciar servidor", details: data },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json(
      { error: "Timeout ao reiniciar servidor" },
      { status: 504 }
    );
  }
}

async function handleWebhookErrors(serverName: string, instanceToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://${serverName}.uazapi.com/webhook/errors`,
      {
        method: "GET",
        headers: { Accept: "application/json", token: instanceToken },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    const data = await res.json().catch(() => []);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Erro ao buscar erros de webhook", details: data },
        { status: res.status }
      );
    }

    const errors = Array.isArray(data) ? data : [];
    const formatted = errors.map((e: Record<string, unknown>) => ({
      created: e.created || "",
      url: e.url || "",
      type: e.type || "",
      event: e.event || "",
      messageType: e.message_type || "",
      statusCode: e.status_code || 0,
      attempts: e.attempts || 0,
      error: e.error || "",
    }));

    return NextResponse.json({ success: true, errors: formatted });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json(
      { error: "Timeout ao buscar erros de webhook" },
      { status: 504 }
    );
  }
}
