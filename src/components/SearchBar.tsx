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

  const handleSearch = async () => {
    if (query.trim().length < 4) {
      setError("Digite pelo menos 4 dígitos");
      return;
    }

    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch(
        `/api/search?number=${encodeURIComponent(query.trim())}`
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        Buscar Número
      </h2>

      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite o número (ex: 5511999...)"
          className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
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
              Buscando...
            </span>
          ) : (
            "Buscar"
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm px-4 py-2 rounded-xl">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          {result.found ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Encontrado no servidor: {result.server}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                {result.instance &&
                  Object.entries(result.instance).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400 min-w-[140px]">
                        {key}:
                      </span>
                      <span className="text-zinc-900 dark:text-zinc-100 break-all">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "")}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 text-sm px-4 py-3 rounded-xl text-center">
              Número não encontrado em nenhum servidor
            </div>
          )}
        </div>
      )}
    </div>
  );
}
