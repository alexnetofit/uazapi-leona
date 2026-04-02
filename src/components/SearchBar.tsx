"use client";

import { useState } from "react";
import { Instance } from "@/lib/types";
import { UserRole } from "@/lib/auth";

interface SearchResult {
  found: boolean;
  results?: { server: string; instance: Instance }[];
  // legacy single-result format
  server?: string;
  instance?: Instance;
}

interface ResultEntry {
  server: string;
  instance: Instance;
  queuePending: number | null;
  queueStatus: string;
  queueLoading: boolean;
  delayLoading: boolean;
  delayResult: string;
  resetLoading: boolean;
  resetResult: string;
  clearLoading: boolean;
  clearResult: string;
  syncLoading: boolean;
  syncResult: string;
}

interface SearchBarProps {
  userRole?: UserRole | null;
}

export default function SearchBar({ userRole }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [error, setError] = useState("");
  const [searchExhausted, setSearchExhausted] = useState(false);

  const isAdmin = userRole === "admin";

  const normalizeNumber = (input: string): string => {
    const digitsOnly = input.replace(/\D/g, "");
    return digitsOnly.length > 8 ? digitsOnly.slice(-8) : digitsOnly;
  };

  const newResultEntry = (server: string, instance: Instance): ResultEntry => ({
    server,
    instance,
    queuePending: null,
    queueStatus: "",
    queueLoading: false,
    delayLoading: false,
    delayResult: "",
    resetLoading: false,
    resetResult: "",
    clearLoading: false,
    clearResult: "",
    syncLoading: false,
    syncResult: "",
  });

  const handleSearch = async () => {
    const cleaned = normalizeNumber(query);
    if (cleaned.length < 4) {
      setError("Digite pelo menos 4 dígitos");
      return;
    }

    setError("");
    setResults([]);
    setSearchExhausted(false);
    setLoading(true);

    try {
      const url = `/api/search?number=${encodeURIComponent(cleaned)}`;
      const res = await fetch(url);
      const data: SearchResult = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error || "Erro na busca");

      if (data.found && data.results && data.results.length > 0) {
        setResults(data.results.map((r) => newResultEntry(r.server, r.instance)));
      } else {
        setSearchExhausted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const updateResult = (index: number, updates: Partial<ResultEntry>) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    );
  };

  const handleCheckQueue = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";
    if (!number) {
      setError("Número da instância não disponível");
      return;
    }

    updateResult(index, { queueLoading: true, queuePending: null, queueStatus: "", delayResult: "", resetResult: "", clearResult: "" });
    setError("");

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, {
          queuePending: data.pending ?? 0,
          queueStatus: data.status ?? "",
        });
      } else {
        const detail = data.details ? ` | API: ${JSON.stringify(data.details)}` : "";
        setError(`${data.error || "Erro ao verificar fila"}${detail}`);
      }
    } catch {
      setError("Erro ao conectar para verificar fila");
    } finally {
      updateResult(index, { queueLoading: false });
    }
  };

  const handleReduceDelay = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { delayLoading: true, delayResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reduce-delay",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { delayResult: "Delay reduzido com sucesso!" });
      } else {
        updateResult(index, { delayResult: data.error || "Erro ao reduzir delay" });
      }
    } catch {
      updateResult(index, { delayResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { delayLoading: false });
    }
  };

  const handleResetInstance = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { resetLoading: true, resetResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-instance",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { resetResult: "Instância reiniciada com sucesso!" });
      } else {
        updateResult(index, { resetResult: data.error || "Erro ao reiniciar instância" });
      }
    } catch {
      updateResult(index, { resetResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { resetLoading: false });
    }
  };

  const handleClearQueue = async (index: number) => {
    if (!confirm("Tem certeza? Isso vai cancelar TODAS as mensagens pendentes na fila.")) {
      return;
    }
    if (!confirm("ÚLTIMA CONFIRMAÇÃO: Todas as mensagens serão marcadas como canceladas. Deseja prosseguir?")) {
      return;
    }

    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { clearLoading: true, clearResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear-queue",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { clearResult: "Fila apagada com sucesso!" });
      } else {
        updateResult(index, { clearResult: data.error || "Erro ao apagar fila" });
      }
    } catch {
      updateResult(index, { clearResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { clearLoading: false });
    }
  };

  const handleTestSync = async (index: number) => {
    const entry = results[index];
    const number = entry.instance.owner || entry.instance.name || "";

    updateResult(index, { syncLoading: true, syncResult: "" });

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-sync",
          server: entry.server,
          number,
          instanceToken: entry.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        updateResult(index, { syncResult: "Enviado com sucesso!" });
      } else {
        updateResult(index, { syncResult: data.error || "Erro ao enviar" });
      }
    } catch {
      updateResult(index, { syncResult: "Erro ao conectar" });
    } finally {
      updateResult(index, { syncLoading: false });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 sm:p-6 mb-6">
      <h2 className="text-base sm:text-lg font-semibold text-zinc-100 mb-3 sm:mb-4">
        Buscar Número
      </h2>

      <div className="flex gap-2 sm:gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite o número (ex: 5511999...)"
          className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 sm:px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
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
              <span className="hidden sm:inline">Buscando...</span>
            </span>
          ) : (
            "Buscar"
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 bg-red-950/30 text-red-400 text-sm px-4 py-2 rounded-xl">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((entry, index) => (
            <div
              key={`${entry.server}-${index}`}
              className="bg-emerald-950/20 border border-emerald-800 rounded-xl p-3 sm:p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-300 text-sm sm:text-base">
                    Encontrado no servidor: {entry.server}
                  </span>
                </div>
                <button
                  onClick={() => handleCheckQueue(index)}
                  disabled={entry.queueLoading}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {entry.queueLoading ? "Verificando..." : "Verificar Fila"}
                </button>
              </div>

              <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm overflow-x-auto">
                {Object.entries(entry.instance).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="font-medium text-zinc-400 min-w-[100px] sm:min-w-[140px] shrink-0">
                      {key}:
                    </span>
                    <span className="text-zinc-100 break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value ?? "")}
                    </span>
                  </div>
                ))}
              </div>

              {entry.queuePending !== null && (
                <div className="mt-3 pt-3 border-t border-emerald-800/50">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="text-sm text-zinc-200">
                      Mensagens na fila:{" "}
                      <strong className={`text-base ${entry.queuePending > 20 ? "text-red-400" : "text-amber-400"}`}>
                        {entry.queuePending}
                      </strong>
                    </span>
                    {entry.queueStatus && (
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        {entry.queueStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleReduceDelay(index)}
                      disabled={entry.delayLoading}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {entry.delayLoading ? "Reduzindo..." : "Reduzir Delay"}
                    </button>
                    <button
                      onClick={() => handleResetInstance(index)}
                      disabled={entry.resetLoading}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {entry.resetLoading ? "Reiniciando..." : "Reiniciar Instância"}
                    </button>
                    <button
                      onClick={() => handleTestSync(index)}
                      disabled={entry.syncLoading}
                      className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                      {entry.syncLoading ? "Enviando..." : "Teste Sync"}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleClearQueue(index)}
                        disabled={entry.clearLoading}
                        className="px-3 py-1.5 rounded-lg bg-red-900 text-red-200 text-xs font-medium hover:bg-red-800 disabled:opacity-50 transition-colors border border-red-700"
                      >
                        {entry.clearLoading ? "Apagando..." : "Apagar Fila"}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {entry.delayResult && (
                      <span className={`text-xs ${entry.delayResult.includes("sucesso") ? "text-green-400" : "text-red-400"}`}>
                        {entry.delayResult}
                      </span>
                    )}
                    {entry.resetResult && (
                      <span className={`text-xs ${entry.resetResult.includes("sucesso") ? "text-green-400" : "text-red-400"}`}>
                        {entry.resetResult}
                      </span>
                    )}
                    {entry.clearResult && (
                      <span className={`text-xs ${entry.clearResult.includes("sucesso") ? "text-green-400" : "text-red-400"}`}>
                        {entry.clearResult}
                      </span>
                    )}
                    {entry.syncResult && (
                      <span className={`text-xs ${entry.syncResult.includes("sucesso") ? "text-green-400" : "text-red-400"}`}>
                        {entry.syncResult}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {results.length > 1 && (
            <div className="bg-zinc-800/50 text-zinc-500 text-xs px-4 py-2 rounded-xl text-center">
              Encontrado em {results.length} servidores
            </div>
          )}
        </div>
      )}

      {results.length === 0 && searchExhausted && (
        <div className="mt-4">
          <div className="bg-zinc-800/50 text-zinc-400 text-sm px-4 py-3 rounded-xl text-center">
            Número não encontrado em nenhum servidor
          </div>
        </div>
      )}
    </div>
  );
}
