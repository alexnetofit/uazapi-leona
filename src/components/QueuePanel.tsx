"use client";

import { useState, useEffect, useCallback } from "react";

interface QueueEntry {
  server: string;
  instanceName: string;
  number: string;
  token?: string;
  pending: number;
  status: string;
  processingNow: boolean;
  sessionReady: boolean;
  resetting: boolean;
  checkedAt: string;
}

interface EntryState {
  delayLoading: boolean;
  delayResult: string;
  resetLoading: boolean;
  resetResult: string;
  clearLoading: boolean;
  clearResult: string;
}

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  idle: { label: "Ociosa", color: "text-zinc-400" },
  queued: { label: "Na fila", color: "text-amber-400" },
  processing: { label: "Processando", color: "text-blue-400" },
  waiting_connection: { label: "Aguardando conexão", color: "text-orange-400" },
  resetting: { label: "Reiniciando", color: "text-red-400" },
};

interface TierConfig {
  title: string;
  min: number;
  max: number | null;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  bgColor: string;
  pendingColor: string;
  icon: React.ReactNode;
}

const TIERS: TierConfig[] = [
  {
    title: "Alerta",
    min: 21,
    max: null,
    accentColor: "text-red-400",
    badgeBg: "bg-red-950/60",
    badgeText: "text-red-400",
    borderColor: "border-red-900/50",
    bgColor: "bg-red-950/10",
    pendingColor: "text-red-400",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    title: "Atenção",
    min: 11,
    max: 20,
    accentColor: "text-amber-400",
    badgeBg: "bg-amber-950/60",
    badgeText: "text-amber-400",
    borderColor: "border-amber-900/40",
    bgColor: "bg-amber-950/10",
    pendingColor: "text-amber-400",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    title: "Monitorar",
    min: 5,
    max: 10,
    accentColor: "text-blue-400",
    badgeBg: "bg-blue-950/60",
    badgeText: "text-blue-400",
    borderColor: "border-blue-900/40",
    bgColor: "bg-blue-950/10",
    pendingColor: "text-blue-400",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

function entryKey(entry: QueueEntry) {
  return `${entry.server}-${entry.number}`;
}

export default function QueuePanel({ isOpen, onClose, isAdmin }: QueuePanelProps) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, EntryState>>({});

  const getState = (entry: QueueEntry): EntryState => {
    return actionStates[entryKey(entry)] || {
      delayLoading: false, delayResult: "",
      resetLoading: false, resetResult: "",
      clearLoading: false, clearResult: "",
    };
  };

  const updateState = (entry: QueueEntry, updates: Partial<EntryState>) => {
    setActionStates((prev) => ({
      ...prev,
      [entryKey(entry)]: { ...getState(entry), ...updates },
    }));
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/queue-monitor/data");
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.entries || []).filter((e: QueueEntry) => e.pending >= 5);
        filtered.sort((a: QueueEntry, b: QueueEntry) => b.pending - a.pending);
        setEntries(filtered);
        setLastCheck(data.lastCheck || null);
      }
    } catch (error) {
      console.error("Erro ao buscar dados de fila:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setActionStates({});
    }
  }, [isOpen, fetchData]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [isOpen, fetchData]);

  const handleReduceDelay = async (entry: QueueEntry) => {
    if (!entry.token) return;
    updateState(entry, { delayLoading: true, delayResult: "" });
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reduce-delay",
          server: entry.server,
          number: entry.number,
          instanceToken: entry.token,
        }),
      });
      const data = await res.json();
      updateState(entry, {
        delayLoading: false,
        delayResult: res.ok ? "Delay reduzido!" : (data.error || "Erro"),
      });
    } catch {
      updateState(entry, { delayLoading: false, delayResult: "Erro ao conectar" });
    }
  };

  const handleResetInstance = async (entry: QueueEntry) => {
    if (!entry.token) return;
    updateState(entry, { resetLoading: true, resetResult: "" });
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-instance",
          server: entry.server,
          number: entry.number,
          instanceToken: entry.token,
        }),
      });
      const data = await res.json();
      updateState(entry, {
        resetLoading: false,
        resetResult: res.ok ? "Reiniciada!" : (data.error || "Erro"),
      });
    } catch {
      updateState(entry, { resetLoading: false, resetResult: "Erro ao conectar" });
    }
  };

  const handleClearQueue = async (entry: QueueEntry) => {
    if (!entry.token) return;
    if (!confirm("Tem certeza? Isso vai cancelar TODAS as mensagens pendentes na fila.")) return;
    if (!confirm("ÚLTIMA CONFIRMAÇÃO: Todas as mensagens serão marcadas como canceladas. Deseja prosseguir?")) return;

    updateState(entry, { clearLoading: true, clearResult: "" });
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear-queue",
          server: entry.server,
          number: entry.number,
          instanceToken: entry.token,
        }),
      });
      const data = await res.json();
      updateState(entry, {
        clearLoading: false,
        clearResult: res.ok ? "Fila apagada!" : (data.error || "Erro"),
      });
    } catch {
      updateState(entry, { clearLoading: false, clearResult: "Erro ao conectar" });
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    return `${days}d atrás`;
  };

  const getStatusInfo = (status: string) => {
    return STATUS_LABELS[status] || { label: status, color: "text-zinc-400" };
  };

  const getEntriesForTier = (tier: TierConfig) => {
    return entries.filter((e) => {
      if (tier.max === null) return e.pending >= tier.min;
      return e.pending >= tier.min && e.pending <= tier.max;
    });
  };

  if (!isOpen) return null;

  const totalCount = entries.length;
  const hasAnyData = !loading || entries.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border-l border-zinc-800 h-full overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <h2 className="text-sm font-semibold text-zinc-100">
              Monitor de Filas
            </h2>
            {totalCount > 0 && (
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-medium">
                {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastCheck && (
              <span className="text-[10px] text-zinc-500" title={formatDate(lastCheck)}>
                {formatRelative(lastCheck)}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "..." : "Atualizar"}
            </button>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <svg className="animate-spin h-6 w-6 text-zinc-500" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
            </div>
          ) : !hasAnyData || totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 mb-3">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <p className="text-sm text-zinc-500">Nenhuma instância com fila significativa</p>
              <p className="text-xs text-zinc-600 mt-1">
                Instâncias com 5 ou mais mensagens na fila aparecerão aqui
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-4">
              {TIERS.map((tier) => {
                const tierEntries = getEntriesForTier(tier);
                if (tierEntries.length === 0) return null;
                return (
                  <div key={tier.title}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className={tier.accentColor}>{tier.icon}</span>
                      <h3 className={`text-xs font-semibold ${tier.accentColor}`}>
                        {tier.title}
                      </h3>
                      <span className={`text-[10px] ${tier.badgeBg} ${tier.badgeText} px-1.5 py-0.5 rounded font-medium`}>
                        {tierEntries.length}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        ({tier.max ? `${tier.min}–${tier.max}` : `${tier.min}+`} na fila)
                      </span>
                    </div>
                    <div className={`rounded-lg border ${tier.borderColor} overflow-hidden divide-y divide-zinc-800/50`}>
                      {tierEntries.map((entry, i) => {
                        const statusInfo = getStatusInfo(entry.status);
                        const state = getState(entry);
                        return (
                          <div
                            key={`${entry.server}-${entry.number}-${i}`}
                            className={`px-3 py-2.5 ${tier.bgColor}`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-semibold text-zinc-100 truncate">
                                  {entry.number || entry.instanceName}
                                </span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">
                                  {entry.server}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className={`text-lg font-bold ${tier.pendingColor}`}>
                                  {entry.pending}
                                </span>
                                <span className="text-[10px] text-zinc-500">na fila</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5 text-[10px]">
                              <span className={`${statusInfo.color} bg-zinc-800/80 px-1.5 py-0.5 rounded`}>
                                {statusInfo.label}
                              </span>
                              {entry.processingNow && (
                                <span className="text-blue-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                                  Processando agora
                                </span>
                              )}
                              {entry.resetting && (
                                <span className="text-red-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                                  Reiniciando
                                </span>
                              )}
                              {!entry.sessionReady && (
                                <span className="text-orange-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                                  Sessão não pronta
                                </span>
                              )}
                            </div>

                            {entry.token && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <span className="text-[10px] text-zinc-500">Token:</span>
                                <code className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded font-mono break-all">
                                  {entry.token}
                                </code>
                              </div>
                            )}

                            {entry.token && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <button
                                  onClick={() => handleReduceDelay(entry)}
                                  disabled={state.delayLoading}
                                  className="px-2.5 py-1 rounded-md bg-amber-600 text-white text-[10px] font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                >
                                  {state.delayLoading ? "Reduzindo..." : "Reduzir Delay"}
                                </button>
                                <button
                                  onClick={() => handleResetInstance(entry)}
                                  disabled={state.resetLoading}
                                  className="px-2.5 py-1 rounded-md bg-red-600 text-white text-[10px] font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                  {state.resetLoading ? "Reiniciando..." : "Reiniciar Instância"}
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleClearQueue(entry)}
                                    disabled={state.clearLoading}
                                    className="px-2.5 py-1 rounded-md bg-red-900 text-red-200 text-[10px] font-medium hover:bg-red-800 disabled:opacity-50 transition-colors border border-red-700"
                                  >
                                    {state.clearLoading ? "Apagando..." : "Apagar Fila"}
                                  </button>
                                )}
                              </div>
                            )}

                            {(state.delayResult || state.resetResult || state.clearResult) && (
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {state.delayResult && (
                                  <span className={`text-[10px] ${state.delayResult.includes("reduzido") ? "text-green-400" : "text-red-400"}`}>
                                    {state.delayResult}
                                  </span>
                                )}
                                {state.resetResult && (
                                  <span className={`text-[10px] ${state.resetResult.includes("Reiniciada") ? "text-green-400" : "text-red-400"}`}>
                                    {state.resetResult}
                                  </span>
                                )}
                                {state.clearResult && (
                                  <span className={`text-[10px] ${state.clearResult.includes("apagada") ? "text-green-400" : "text-red-400"}`}>
                                    {state.clearResult}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
