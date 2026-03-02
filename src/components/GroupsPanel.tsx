"use client";

import { useState, useRef } from "react";

const GROUPS = [
  {
    id: "120363406348891106@g.us",
    label: "Disparo Teste",
    description: "Grupo Suporte",
  },
  {
    id: "120363407196128260@g.us",
    label: "Disparo Oficial",
    description: "Grupo QG Leona Flow",
  },
];

type MessageType = "text" | "media";
type SendStatus = "idle" | "sending" | "success" | "error";

interface GroupsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GroupsPanel({ isOpen, onClose }: GroupsPanelProps) {
  const [selectedGroup, setSelectedGroup] = useState(GROUPS[0].id);
  const [messageType, setMessageType] = useState<MessageType>("text");
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setText("");
    setCaption("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    setStatus("sending");
    setStatusMessage("");

    try {
      let res: Response;

      if (messageType === "text") {
        if (!text.trim()) {
          setStatus("error");
          setStatusMessage("Digite uma mensagem");
          return;
        }

        res = await fetch("/api/groups/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group: selectedGroup, text: text.trim() }),
        });
      } else {
        if (!file) {
          setStatus("error");
          setStatusMessage("Selecione um arquivo");
          return;
        }

        const formData = new FormData();
        formData.append("group", selectedGroup);
        formData.append("file", file);
        if (caption.trim()) formData.append("caption", caption.trim());

        res = await fetch("/api/groups/send", {
          method: "POST",
          body: formData,
        });
      }

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setStatusMessage("Mensagem enviada com sucesso!");
        resetForm();
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setStatusMessage(data.error || "Erro ao enviar mensagem");
      }
    } catch {
      setStatus("error");
      setStatusMessage("Erro de conexão ao enviar mensagem");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "🖼";
    if (mimeType.startsWith("video/")) return "🎬";
    if (mimeType.startsWith("audio/")) return "🎵";
    return "📄";
  };

  if (!isOpen) return null;

  const selectedGroupInfo = GROUPS.find((g) => g.id === selectedGroup);

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
              className="text-green-400"
            >
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <h2 className="text-sm font-semibold text-zinc-100">
              Envio para Grupos
            </h2>
          </div>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Group Selector */}
          <div>
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">
              Grupo de destino
            </label>
            <div className="space-y-2">
              {GROUPS.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    selectedGroup === group.id
                      ? "border-green-600 bg-green-950/30"
                      : "border-zinc-800 bg-zinc-800/50 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          selectedGroup === group.id
                            ? "text-green-300"
                            : "text-zinc-200"
                        }`}
                      >
                        {group.label}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {group.description}
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        selectedGroup === group.id
                          ? "border-green-500"
                          : "border-zinc-600"
                      }`}
                    >
                      {selectedGroup === group.id && (
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Message Type Toggle */}
          <div>
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">
              Tipo de envio
            </label>
            <div className="flex bg-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setMessageType("text")}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  messageType === "text"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Texto
              </button>
              <button
                onClick={() => setMessageType("media")}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  messageType === "media"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Mídia
              </button>
            </div>
          </div>

          {/* Text Mode */}
          {messageType === "text" && (
            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">
                Mensagem
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Digite a mensagem para o grupo..."
                rows={5}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
              />
              <p className="text-[10px] text-zinc-600 mt-1 text-right">
                {text.length} caracteres
              </p>
            </div>
          )}

          {/* Media Mode */}
          {messageType === "media" && (
            <>
              <div>
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">
                  Arquivo
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  className="hidden"
                />
                {file ? (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-3 flex items-center gap-3">
                    <span className="text-xl">{getFileIcon(file.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">
                        {file.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
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
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-zinc-800/50 border border-dashed border-zinc-700 rounded-lg px-3 py-6 flex flex-col items-center gap-2 hover:border-zinc-500 transition-colors"
                  >
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
                      className="text-zinc-500"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-xs text-zinc-500">
                      Clique para selecionar arquivo
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      Imagem, vídeo, áudio ou documento
                    </span>
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 block">
                  Legenda (opcional)
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Legenda da mídia..."
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
            </>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`px-3 py-2 rounded-lg text-xs ${
                status === "success"
                  ? "bg-green-950/40 border border-green-900/40 text-green-300"
                  : "bg-red-950/40 border border-red-900/40 text-red-300"
              }`}
            >
              {statusMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {selectedGroupInfo?.label} — {selectedGroupInfo?.description}
          </div>
          <button
            onClick={handleSend}
            disabled={
              status === "sending" ||
              (messageType === "text" && !text.trim()) ||
              (messageType === "media" && !file)
            }
            className="w-full px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {status === "sending" ? (
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
                Enviando...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Enviar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
