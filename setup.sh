#!/usr/bin/env bash
set -euo pipefail

# ================================================================
# setup.sh — Instalación y configuración del Discord Bot
# ================================================================
# Uso: sudo bash setup.sh
# ================================================================

INSTALL_DIR="/opt/discordbot"
SERVICE_NAME="discord-bot"
BOT_USER="discordbot"

echo "🤖 Instalando Discord Bot..."

# 1. Crear usuario del sistema si no existe
if ! id "$BOT_USER" &>/dev/null; then
  echo "👤 Creando usuario del sistema: $BOT_USER"
  useradd --system --create-home --shell /usr/sbin/nologin "$BOT_USER"
fi

# 2. Crear directorio de instalación
echo "📁 Configurando directorio de instalación: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r . "$INSTALL_DIR/"
chown -R "$BOT_USER:$BOT_USER" "$INSTALL_DIR"

# 3. Instalar dependencias
echo "📦 Instalando dependencias de Node.js..."
cd "$INSTALL_DIR"
sudo -u "$BOT_USER" pnpm install --frozen-lockfile --prod=false

# 4. Compilar TypeScript
echo "🔨 Compilando TypeScript con tsup..."
sudo -u "$BOT_USER" npx tsup

# 5. Verificar archivo .env
if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo "⚠️  Archivo .env no encontrado. Copiando .env.example..."
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  echo "   ❗ EDITA $INSTALL_DIR/.env con tus credenciales antes de iniciar"
fi

# 6. Instalar servicio systemd
echo "⚙️  Instalando servicio systemd..."
cp "$INSTALL_DIR/discord-bot.service" "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo ""
echo "✅ Instalación completada."
echo ""
echo "Próximos pasos:"
echo "  1. Edita $INSTALL_DIR/.env con tus credenciales"
echo "  2. Asegúrate de que PostgreSQL y Redis estén corriendo"
echo "  3. Inicia el bot: sudo systemctl start $SERVICE_NAME"
echo "  4. Verifica el estado: sudo systemctl status $SERVICE_NAME"
echo "  5. Ver logs: sudo journalctl -u $SERVICE_NAME -f"
echo ""
