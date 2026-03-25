"use client";

import { useState } from "react";
import { Instance } from "@/lib/types";

interface SearchResult {
  found: boolean;
  server?: string;
  instance?: Instance;
}

interface ResultEntry {
  server: string;
  instance: Instance;
  queuePosition: number | null;
  queueLoading: boolean;
  delayLoading: boolean;
  delayResult: string;
  resetLoading: boolean;
  resetResult: string;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [error, setError] = useState("");
  const [searchExhausted, setSearchExhausted] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);

  const normalizeNumber = (input: string): string => {
    const digitsOnly = input.replace(/\D/g, "");
    return digitsOnly.length > 8 ? digitsOnly.slice(-8) : digitsOnly;
  };

  const doSearch = async (skipServers: string[]): Promise<SearchResult> => {
    const cleaned = normalizeNumber(query);
    let url = `/api/search?number=${encodeURIComponent(cleaned)}`;
    if (skipServers.length > 0) {
      url += `&skipServers=${encodeURIComponent(skipServers.join(","))}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro na busca");
    return data;
  };

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
      const data = await doSearch([]);

      if (data.found && data.server && data.instance) {
        setResults([{
          server: data.server,
          instance: data.instance,
          queuePosition: null,
          queueLoading: false,
          delayLoading: false,
          delayResult: "",
          resetLoading: false,
          resetResult: "",
        }]);
      } else {
        setSearchExhausted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchMore = async () => {
    const skipServers = results.map((r) => r.server);
    setMoreLoading(true);
    setError("");

    try {
      const data = await doSearch(skipServers);

      if (data.found && data.server && data.instance) {
        setResults((prev) => [
          ...prev,
          {
            server: data.server!,
            instance: data.instance!,
            queuePosition: null,
            queueLoading: false,
            delayLoading: false,
            delayResult: "",
            resetLoading: false,
            resetResult: "",
          },
        ]);
      } else {
        setSearchExhausted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar em mais servidores");
    } finally {
      setMoreLoading(false);
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

    updateResult(index, { queueLoading: true, queuePosition: null, delayResult: "" });
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
        updateResult(index, { queuePosition: data.queuePosition ?? 0 });
      } else {
        const detail = data.details ? ` | API: ${JSON.stringify(data.details)}` : "";
        const req = data.request ? ` | Request: ${data.request.url}` : "";
        setError(`${data.error || "Erro ao verificar fila"}${req}${detail}`);
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

              {entry.queuePosition !== null && (
                <div className="mt-3 pt-3 border-t border-emerald-800/50 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-zinc-200">
                    Posição na fila:{" "}
                    <strong className="text-amber-400 text-base">
                      {entry.queuePosition}
                    </strong>
                  </span>
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
                  {entry.delayResult && (
                    <span
                      className={`text-xs ${
                        entry.delayResult.includes("sucesso")
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {entry.delayResult}
                    </span>
                  )}
                  {entry.resetResult && (
                    <span
                      className={`text-xs ${
                        entry.resetResult.includes("sucesso")
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {entry.resetResult}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {!searchExhausted && (
            <button
              onClick={handleSearchMore}
              disabled={moreLoading}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {moreLoading ? (
                <>
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
                  Buscando...
                </>
              ) : (
                "Buscar em mais servidores"
              )}
            </button>
          )}

          {searchExhausted && results.length > 0 && (
            <div className="bg-zinc-800/50 text-zinc-500 text-xs px-4 py-2 rounded-xl text-center">
              Não encontrado em mais servidores
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
