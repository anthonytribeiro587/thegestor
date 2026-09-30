#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> TheGestor: Orquestrador Maestro bootstrap"

if ! command -v node >/dev/null 2>&1; then
  echo "Erro: Node.js não encontrado." >&2
  exit 1
fi

NODE_VERSION="$(node -p "process.versions.node")"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"

echo "Node: $NODE_VERSION"

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Erro: o Orquestrador Maestro V1 requer Node.js 20.19+." >&2
  exit 1
fi

echo "==> Instalando/atualizando CLI V1 beta..."
npm install -g @iapro/orquestrador-maestro-cli@beta

echo "==> Instalando Maestro no home deste Codespace..."
orquestrador-maestro install

echo "==> Inicializando/preservando DEV/..."
orquestrador-maestro init-dev --project-path "$PROJECT_ROOT"

echo "==> Verificando..."
orquestrador-maestro verify

echo
echo "Maestro pronto neste Codespace."
echo 'Use: codex'
echo 'Prompt: Use o Orquestrador Maestro. Leia AGENTS.md e DEV/, escolha a skill correta, execute e verifique.'
