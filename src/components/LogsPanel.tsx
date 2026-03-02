"use client";

import { useState, useEffect, useCallback } from "react";
import { NotificationLog } from "@/lib/types";

const TYPE_CONFIG = {
  server_error: {
    label: "Servidor Inacessível",
    color: "text-red-400",
    bg: "bg-red-950/30 border-red-900/40",
    dot: "bg-red-500",
  },
  server_unhealthy: {
    label: "Servidor Não Saudável",
    color: "text-amber-400",
    bg: "bg-amber-950/30 border-amber-900/40",
    dot: "bg-amber-500",
  },
  disconnect_alert: {
    label: "Desconexão em Massa",
    color: "text-orange-400",
    bg: "bg-orange-950/30 border-orange-900/40",
    dot: "bg-orange-500",
  },
};

interface LogsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export default function LogsPanel({ isOpen, onClose, isAdmin }: LogsPanelProps) {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchLogs();
  }, [isOpen, fetchLogs]);

  const handleClear = async () => {
    if (!confirm("Limpar todo o histórico de notificações?")) return;
    try {
      await fetch("/api/logs", { method: "DELETE" });
      setLogs([]);
    } catch (error) {
      console.error("Erro ao limpar logs:", error);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-400"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-zinc-100">
              Logs de Notificações
            </h2>
            {logs.length > 0 && (
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                {logs.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && logs.length > 0 && (
              <button
                onClick={handleClear}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
              >
                Limpar
              </button>
            )}
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <svg
                className="animate-spin h-6 w-6 text-zinc-500"
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
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-700 mb-3"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <p className="text-sm text-zinc-500">Nenhuma notificação registrada</p>
              <p className="text-xs text-zinc-600 mt-1">
                Alertas de erro aparecerão aqui
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {logs.map((log) => {
                const config = TYPE_CONFIG[log.type];
                return (
                  <div
                    key={log.id}
                    className={`px-4 py-3 border-l-2 ${config.bg}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        <span className={`text-[11px] font-semibold ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <span
                        className="text-[11px] text-zinc-400"
                        title={formatDate(log.timestamp)}
                      >
                        {formatRelative(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-100 font-medium mb-0.5">
                      {log.server}
                    </p>
                    <p className="text-xs text-zinc-200">{log.message}</p>
                    {log.details && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(log.details).map(([key, value]) =>
                          value !== null && value !== undefined ? (
                            <span
                              key={key}
                              className="text-[10px] bg-zinc-800/80 text-zinc-300 px-1.5 py-0.5 rounded"
                            >
                              {key}: {String(value)}
                            </span>
                          ) : null
                        )}
                      </div>
                    )}
                    <p
                      className="text-[10px] text-zinc-400 mt-1"
                      title={log.timestamp}
                    >
                      {formatDate(log.timestamp)}
                    </p>
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
