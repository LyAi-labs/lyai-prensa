#!/usr/bin/env bash
set -e

# Script de automatización / comando para añadir complementos
# Uso:
#   npm run anadir-complemento
#   npm run anadir-complemento <id-de-lyai-shared | paquete-npm>

PROJECT_ROOT="/opt/lyai/app/lyai-prensa"
SHARED_SYNC="/opt/lyai/app/lyai-shared/bin/lyai-shared-sync"

echo "=== Comando Añadir Complemento (LyAi Prensa) ==="

if [ -z "$1" ]; then
  echo ""
  echo "Uso: npm run anadir-complemento <nombre-o-id>"
  echo ""
  echo "1. Componentes disponibles en lyai-shared:"
  if [ -x "$SHARED_SYNC" ]; then
    "$SHARED_SYNC" --list | head -n 25
    echo "   ... (ejecuta '$SHARED_SYNC --list' para ver todos)"
  fi
  echo ""
  echo "2. Para instalar un paquete NPM:"
  echo "   npm run anadir-complemento <paquete>"
  echo ""
  echo "3. O invoca en el chat de Antigravity:"
  echo "   /añadir-complemento"
  exit 0
fi

ITEM="$1"

# Comprobar si existe en lyai-shared
if [ -x "$SHARED_SYNC" ] && "$SHARED_SYNC" --list | grep -q "^${ITEM}[[:space:]]"; then
  echo "→ Sincronizando '$ITEM' desde lyai-shared..."
  "$SHARED_SYNC" "$PROJECT_ROOT" "$ITEM" --to src/shared
  echo "✓ Sincronizado correctamente en src/shared/$ITEM"
  exit 0
fi

# De lo contrario asumir paquete npm
echo "→ Instalando paquete npm '$ITEM'..."
npm install "$ITEM"
echo "✓ Paquete instalado. Recuerda crear la fachada en src/components/ui/ si es necesario."

