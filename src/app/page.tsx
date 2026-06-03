"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import TotalSummary from "@/components/TotalSummary";
import ServerCard from "@/components/ServerCard";
import AddServerModal from "@/components/AddServerModal";
import SearchBar from "@/components/SearchBar";
import WebhookConfig from "@/components/WebhookConfig";
import PushNotification from "@/components/PushNotification";
import LogsPanel from "@/components/LogsPanel";
// STANDBY: monitor de filas — reativar junto com cron /api/queue-monitor (ver STANDBY.md)
// import QueuePanel from "@/components/QueuePanel";
import GroupsPanel from "@/components/GroupsPanel";
import { DashboardData, ServerDashboard, ServerSnapshot } from "@/lib/types";
import { UserRole } from "@/lib/auth";

function buildDashboardFromServers(
  servers: ServerDashboard[],
  lastPoll: string | null = null
): DashboardData {
  const healthy = servers.filter((s) => !s.error);
  const totalInstances = healthy.reduce((sum, s) => sum + s.totalInstances, 0);
  const totalConnected = healthy.reduce((sum, s) => sum + s.connectedInstances, 0);
  const newestTs = servers.reduce(
    (max, s) => (s.timestamp && s.timestamp > max ? s.timestamp : max),
    ""
  );

  return {
    servers,
    totalInstances,
    totalConnected,
    totalDisconnected: totalInstances - totalConnected,
    lastPoll: lastPoll ?? (newestTs || null),
  };
}

function snapshotToDashboard(
  snapshot: ServerSnapshot,
  previous: ServerDashboard["previous"]
): ServerDashboard {
  return {
    serverName: snapshot.serverName,
    totalInstances: snapshot.totalInstances,
    connectedInstances: snapshot.connectedInstances,
    disconnectedInstances: snapshot.disconnectedInstances,
    timestamp: snapshot.timestamp,
    previous,
    instances: [],
    error: snapshot.error === true,
    dc: snapshot.dc || "",
  };
}

/* STANDBY: auto-refresh countdown — reativar com cron /api/poll (ver STANDBY.md)
const POLL_INTERVAL_SECONDS = 120;

function calcSecondsUntilNextPoll(lastPoll: string | null): number {
  if (!lastPoll) return 0;
  const lastPollTime = new Date(lastPoll).getTime();
  const nextPollTime = lastPollTime + POLL_INTERVAL_SECONDS * 1000;
  const remaining = Math.round((nextPollTime - Date.now()) / 1000);
  return Math.max(0, Math.min(remaining, POLL_INTERVAL_SECONDS));
}
*/

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [servers, setServers] = useState<{ name: string }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  // STANDBY: monitor de filas
  // const [showQueues, setShowQueues] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [refreshingServers, setRefreshingServers] = useState<Set<string>>(new Set());
  const router = useRouter();

  const isAdmin = userRole === "admin";
  const loadingRef = useRef(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setUserRole(data.user.role);
        } else {
          router.push("/login");
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const fetchStatus = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/status?_=${Date.now()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      if (res.ok) {
        const statusData = await res.json();
        setData(statusData);
        return statusData as DashboardData;
      } else {
        const empty: DashboardData = {
          servers: [],
          totalInstances: 0,
          totalConnected: 0,
          totalDisconnected: 0,
          lastPoll: null,
        };
        setData(empty);
        return empty;
      }
    } catch (error) {
      console.error("Erro ao buscar status:", error);
      const empty: DashboardData = {
        servers: [],
        totalInstances: 0,
        totalConnected: 0,
        totalDisconnected: 0,
        lastPoll: null,
      };
      setData(empty);
      return empty;
    }
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/servers?_=${Date.now()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      if (res.ok) {
        const serverList = await res.json();
        setServers(Array.isArray(serverList) ? serverList : []);
      }
    } catch (error) {
      console.error("Erro ao buscar servidores:", error);
    }
  }, []);

  /* STANDBY: poll em lote via GET /api/poll (usado pelo cron)
  const triggerPoll = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      await fetch("/api/poll", { signal: controller.signal });
      clearTimeout(timeout);
    } catch (error) {
      console.error("Erro ao disparar polling:", error);
    }
  }, []);
  */

  const loadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    await Promise.all([fetchStatus(), fetchServers()]);
    setLoading(false);
    loadingRef.current = false;
  }, [fetchStatus, fetchServers]);

  const applyServerSnapshot = useCallback(
    (serverName: string, snapshot: ServerSnapshot) => {
      setData((prev) => {
        const existing = prev?.servers ?? [];
        const names =
          existing.length > 0
            ? existing.map((s) => s.serverName)
            : servers.map((s) => s.name);

        const byName = new Map(existing.map((s) => [s.serverName, s]));
        for (const name of names) {
          if (!byName.has(name)) {
            byName.set(name, {
              serverName: name,
              totalInstances: 0,
              connectedInstances: 0,
              disconnectedInstances: 0,
              timestamp: "",
              previous: null,
              instances: [],
              error: true,
            });
          }
        }

        const prevServer = byName.get(serverName);
        byName.set(
          serverName,
          snapshotToDashboard(snapshot, prevServer?.previous ?? null)
        );

        const ordered = names.map((name) => byName.get(name)!);
        return buildDashboardFromServers(ordered, snapshot.timestamp);
      });
    },
    [servers]
  );

  const manualPoll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const serverNames =
      data?.servers?.map((s) => s.serverName) ??
      servers.map((s) => s.name);

    if (serverNames.length > 0) {
      setRefreshingServers(new Set(serverNames));

      await Promise.allSettled(
        serverNames.map(async (serverName) => {
          try {
            const res = await fetch("/api/poll/server", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ serverName }),
              cache: "no-store",
            });
            const body = await res.json();
            if (body.snapshot) {
              applyServerSnapshot(serverName, body.snapshot as ServerSnapshot);
            }
          } catch (err) {
            console.error(`Erro ao pollar ${serverName}:`, err);
          } finally {
            setRefreshingServers((prev) => {
              const next = new Set(prev);
              next.delete(serverName);
              return next;
            });
          }
        })
      );

      setRefreshingServers(new Set());
    }

    // Sincroniza totais e "anterior" vindos do Redis (sem cache CDN)
    await fetchStatus();
    setLoading(false);
    loadingRef.current = false;
  }, [fetchStatus, applyServerSnapshot, data, servers]);

  useEffect(() => {
    if (userRole) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  /* STANDBY: auto-refresh a cada 2 min (re-lê /api/status)
  useEffect(() => {
    if (!userRole) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (!loadingRef.current) {
            loadData();
          }
          return POLL_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);
  */

  const handleAddServer = async (name: string, token: string) => {
    const res = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, token }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Erro ao adicionar servidor");
    }

    await manualPoll();
  };

  const handleRemoveServer = async (name: string) => {
    try {
      const res = await fetch(`/api/servers?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadData();
      }
    } catch (error) {
      console.error("Erro ao remover servidor:", error);
    }
  };

  /* STANDBY: formatCountdown
  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  */

  if (!userRole) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            className="opacity-25"
          />
          <path
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            className="opacity-75"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <path d="M8 21h8" /><path d="M12 17v4" />
                </svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-zinc-100 leading-tight">Gestão UAZAPI</h1>
                <p className="text-xs text-zinc-400">Monitoramento de instâncias</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* STANDBY: countdown auto-refresh
              <div className="flex items-center gap-1.5 text-xs sm:text-xs text-zinc-400 bg-zinc-800 px-2.5 sm:px-3 py-2 rounded-lg">
                ...
              </div>
              */}

              {isAdmin && (
                <button
                  onClick={manualPoll}
                  disabled={loading}
                  className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  title="Atualizar agora"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:hidden">
                    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  <span className="hidden sm:inline">{refreshingServers.size > 0 ? `Atualizando ${refreshingServers.size}...` : loading ? "Atualizando..." : "Atualizar"}</span>
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => setShowGroups(true)}
                  className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs bg-zinc-800 text-green-400 hover:bg-zinc-700 transition-colors"
                  title="Envio para Grupos"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </button>
              )}

              {/* STANDBY: monitor de filas — reativar com STANDBY.md
              <button
                onClick={() => setShowQueues(true)}
                className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs bg-zinc-800 text-amber-400 hover:bg-zinc-700 transition-colors"
                title="Filas grandes"
              >
                ...
              </button>
              */}

              <button
                onClick={() => setShowLogs(true)}
                className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
                title="Logs de notificações"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </button>

              {isAdmin && <WebhookConfig />}

              {isAdmin && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="p-2 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors"
                  title="Adicionar servidor"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:hidden">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="hidden sm:inline">+ Servidor</span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                title="Sair"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <svg
                className="animate-spin h-8 w-8 text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  className="opacity-25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  className="opacity-75"
                />
              </svg>
              <p className="text-zinc-400 text-sm">Carregando dados...</p>
            </div>
          </div>
        ) : (
          <>
            <SearchBar userRole={userRole} />

            {data && (
              <TotalSummary
                totalInstances={data.totalInstances}
                totalConnected={data.totalConnected}
                totalDisconnected={data.totalDisconnected}
                lastPoll={data.lastPoll}
              />
            )}

            {data && data.servers.length > 0 ? (
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-zinc-100 mb-3 sm:mb-4">
                  Servidores ({data.servers.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {data.servers.map((server) => (
                    <ServerCard
                      key={server.serverName}
                      serverName={server.serverName}
                      totalInstances={server.totalInstances}
                      connectedInstances={server.connectedInstances}
                      disconnectedInstances={server.disconnectedInstances}
                      timestamp={server.timestamp}
                      previous={server.previous ?? null}
                      error={server.error}
                      dc={server.dc}
                      isRefreshing={refreshingServers.has(server.serverName)}
                      isAdmin={isAdmin}
                      onRemove={isAdmin ? handleRemoveServer : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : servers.length === 0 ? (
              <div className="text-center py-16 sm:py-20">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-zinc-400"
                  >
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-zinc-100 mb-2">
                  Nenhum servidor cadastrado
                </h3>
                <p className="text-zinc-400 mb-4 text-sm">
                  Adicione seu primeiro servidor UAZAPI para começar o
                  monitoramento.
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                  >
                    Adicionar Servidor
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-zinc-400 text-sm">
                  Servidores cadastrados mas sem dados ainda. Clique em
                  &quot;Atualizar&quot; para buscar os dados.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {isAdmin && (
        <AddServerModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddServer}
        />
      )}

      {/* STANDBY: monitor de filas
      <QueuePanel isOpen={showQueues} onClose={() => setShowQueues(false)} isAdmin={isAdmin} />
      */}
      <LogsPanel isOpen={showLogs} onClose={() => setShowLogs(false)} isAdmin={isAdmin} />

      {isAdmin && (
        <GroupsPanel isOpen={showGroups} onClose={() => setShowGroups(false)} />
      )}

      <PushNotification />
    </div>
  );
}
