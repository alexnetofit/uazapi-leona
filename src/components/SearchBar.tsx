"use client";

import { useState } from "react";
import { Instance } from "@/lib/types";

interface SearchResult {
  found: boolean;
  server?: string;
  instance?: Instance;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [delayLoading, setDelayLoading] = useState(false);
  const [delayResult, setDelayResult] = useState<string>("");

  const normalizeNumber = (input: string): string => {
    const digitsOnly = input.replace(/\D/g, "");
    return digitsOnly.length > 8 ? digitsOnly.slice(-8) : digitsOnly;
  };

  const handleSearch = async () => {
    const cleaned = normalizeNumber(query);
    if (cleaned.length < 4) {
      setError("Digite pelo menos 4 dígitos");
      return;
    }

    setError("");
    setResult(null);
    setQueuePosition(null);
    setDelayResult("");
    setLoading(true);

    try {
      const res = await fetch(
        `/api/search?number=${encodeURIComponent(cleaned)}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro na busca");
        return;
      }

      setResult(data);
    } catch {
      setError("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckQueue = async () => {
    if (!result?.found || !result.server || !result.instance) return;

    const number = result.instance.owner || result.instance.name || "";
    if (!number) {
      setError("Número da instância não disponível");
      return;
    }

    setQueueLoading(true);
    setQueuePosition(null);
    setDelayResult("");
    setError("");

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check",
          server: result.server,
          number,
          instanceToken: result.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setQueuePosition(data.queuePosition ?? 0);
      } else {
        const detail = data.details ? ` | API: ${JSON.stringify(data.details)}` : "";
        const req = data.request ? ` | Request: ${data.request.url}` : "";
        setError(`${data.error || "Erro ao verificar fila"}${req}${detail}`);
      }
    } catch {
      setError("Erro ao conectar para verificar fila");
    } finally {
      setQueueLoading(false);
    }
  };

  const handleReduceDelay = async () => {
    if (!result?.found || !result.server || !result.instance) return;

    const number = result.instance.owner || result.instance.name || "";

    setDelayLoading(true);
    setDelayResult("");

    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reduce-delay",
          server: result.server,
          number,
          instanceToken: result.instance.token || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDelayResult("Delay reduzido com sucesso!");
      } else {
        setDelayResult(data.error || "Erro ao reduzir delay");
      }
    } catch {
      setDelayResult("Erro ao conectar");
    } finally {
      setDelayLoading(false);
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

      {result && (
        <div className="mt-4">
          {result.found ? (
            <div className="bg-emerald-950/20 border border-emerald-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-300 text-sm sm:text-base">
                    Encontrado no servidor: {result.server}
                  </span>
                </div>
                <button
                  onClick={handleCheckQueue}
                  disabled={queueLoading}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {queueLoading ? "Verificando..." : "Verificar Fila"}
                </button>
              </div>

              <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm overflow-x-auto">
                {result.instance &&
                  Object.entries(result.instance).map(([key, value]) => (
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

              {/* Queue Result */}
              {queuePosition !== null && (
                <div className="mt-3 pt-3 border-t border-emerald-800/50 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-zinc-200">
                    Posição na fila: <strong className="text-amber-400 text-base">{queuePosition}</strong>
                  </span>
                  <button
                    onClick={handleReduceDelay}
                    disabled={delayLoading}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {delayLoading ? "Reduzindo..." : "Reduzir Delay"}
                  </button>
                  {delayResult && (
                    <span className={`text-xs ${delayResult.includes("sucesso") ? "text-green-400" : "text-red-400"}`}>
                      {delayResult}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-800/50 text-zinc-400 text-sm px-4 py-3 rounded-xl text-center">
              Número não encontrado em nenhum servidor
            </div>
          )}
        </div>
      )}
    </div>
  );
}
