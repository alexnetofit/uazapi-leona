"use client";

import { useState, useEffect, useCallback } from "react";
import TotalSummary from "@/components/TotalSummary";
import ServerCard from "@/components/ServerCard";
import AddServerModal from "@/components/AddServerModal";
import SearchBar from "@/components/SearchBar";
import WebhookConfig from "@/components/WebhookConfig";
import { DashboardData } from "@/lib/types";

const POLL_INTERVAL = 120000; // 2 minutos

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [servers, setServers] = useState<{ name: string }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(120);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const statusData = await res.json();
        setData(statusData);
      }
    } catch (error) {
      console.error("Erro ao buscar status:", error);
    }
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      if (res.ok) {
        const serverList = await res.json();
        setServers(serverList);
      }
    } catch (error) {
      console.error("Erro ao buscar servidores:", error);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchServers()]);
    setLoading(false);
    setCountdown(120);
  }, [fetchStatus, fetchServers]);

  useEffect(() => {
    loadAll();

    const pollInterval = setInterval(() => {
      loadAll();
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [loadAll]);

  // Countdown timer
  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 120));
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

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

    await loadAll();
  };

  const handleRemoveServer = async (name: string) => {
    try {
      const res = await fetch(`/api/servers?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadAll();
      }
    } catch (error) {
      console.error("Erro ao remover servidor:", error);
    }
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Gestão UAZAPI
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Monitoramento de instâncias
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Countdown */}
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 rounded-lg">
                <svg
                  className="animate-spin h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    animationDuration: "3s",
                  }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    className="opacity-75"
                  />
                </svg>
                {formatCountdown(countdown)}
              </div>

              <button
                onClick={loadAll}
                className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                title="Atualizar agora"
              >
                Atualizar
              </button>

              <WebhookConfig />

              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                + Servidor
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                Carregando dados...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Busca */}
            <SearchBar />

            {/* Resumo Geral */}
            {data && (
              <TotalSummary
                totalInstances={data.totalInstances}
                totalConnected={data.totalConnected}
                totalDisconnected={data.totalDisconnected}
                lastPoll={data.lastPoll}
              />
            )}

            {/* Cards dos Servidores */}
            {data && data.servers.length > 0 ? (
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  Servidores ({data.servers.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.servers.map((server) => (
                    <ServerCard
                      key={server.serverName}
                      serverName={server.serverName}
                      totalInstances={server.totalInstances}
                      connectedInstances={server.connectedInstances}
                      disconnectedInstances={server.disconnectedInstances}
                      timestamp={server.timestamp}
                      onRemove={handleRemoveServer}
                    />
                  ))}
                </div>
              </div>
            ) : servers.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-zinc-400"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="20"
                      height="8"
                      rx="2"
                      ry="2"
                    />
                    <rect
                      x="2"
                      y="14"
                      width="20"
                      height="8"
                      rx="2"
                      ry="2"
                    />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  Nenhum servidor cadastrado
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 mb-4 text-sm">
                  Adicione seu primeiro servidor UAZAPI para começar o
                  monitoramento.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Adicionar Servidor
                </button>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                  Servidores cadastrados mas sem dados ainda. Aguarde o próximo
                  polling ou clique em &quot;Atualizar&quot;.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal Adicionar Servidor */}
      <AddServerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddServer}
      />
    </div>
  );
}
