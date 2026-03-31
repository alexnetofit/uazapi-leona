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

export default function QueuePanel({ isOpen, onClose, isAdmin }: QueuePanelProps) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/queue-monitor/data");
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.entries || []).filter((e: QueueEntry) => e.pending > 20);
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
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [isOpen, fetchData]);

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

  if (!isOpen) return null;

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
              Filas Grandes
            </h2>
            {entries.length > 0 && (
              <span className="text-[10px] bg-red-950/60 text-red-400 px-1.5 py-0.5 rounded font-medium">
                {entries.length}
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
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 mb-3">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <p className="text-sm text-zinc-500">Nenhuma instância com fila grande</p>
              <p className="text-xs text-zinc-600 mt-1">
                Instâncias com mais de 20 mensagens na fila aparecerão aqui
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {entries.map((entry, i) => {
                const statusInfo = getStatusInfo(entry.status);
                return (
                  <div
                    key={`${entry.server}-${entry.number}-${i}`}
                    className="px-4 py-3 border-l-2 bg-amber-950/10 border-amber-900/40"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">
                          {entry.number || entry.instanceName}
                        </span>
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                          {entry.server}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-bold text-amber-400">
                          {entry.pending}
                        </span>
                        <span className="text-[10px] text-zinc-500">na fila</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[10px]">
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

                    {isAdmin && entry.token && (
                      <div className="mt-2 flex items-center gap-1">
                        <span className="text-[10px] text-zinc-500">Token:</span>
                        <code className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded font-mono break-all">
                          {entry.token}
                        </code>
                      </div>
                    )}
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
