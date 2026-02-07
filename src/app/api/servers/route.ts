import { NextRequest, NextResponse } from "next/server";
import { getServers, addServer, removeServer } from "@/lib/kv";

export async function GET() {
  try {
    const servers = await getServers();
    // Retorna apenas os nomes (sem expor tokens)
    const safeServers = servers.map((s) => ({ name: s.name }));
    return NextResponse.json(safeServers);
  } catch (error) {
    console.error("Erro ao listar servidores:", error);
    return NextResponse.json(
      { error: "Erro ao listar servidores" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, token } = body;

    if (!name || !token) {
      return NextResponse.json(
        { error: "Nome e token são obrigatórios" },
        { status: 400 }
      );
    }

    // Validar que o nome não contém caracteres inválidos
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return NextResponse.json(
        {
          error:
            "Nome do servidor deve conter apenas letras, números, hífens e underscores",
        },
        { status: 400 }
      );
    }

    await addServer({ name, token });
    return NextResponse.json({ success: true, message: "Servidor adicionado" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao adicionar servidor";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { error: "Nome do servidor é obrigatório" },
        { status: 400 }
      );
    }

    await removeServer(name);
    return NextResponse.json({ success: true, message: "Servidor removido" });
  } catch (error) {
    console.error("Erro ao remover servidor:", error);
    return NextResponse.json(
      { error: "Erro ao remover servidor" },
      { status: 500 }
    );
  }
}
