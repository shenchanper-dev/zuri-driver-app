#!/bin/bash

# Script para iniciar Expo en el puerto 8081 de manera confiable
# Limpia cualquier proceso previo y asegura el puerto correcto

echo "🧹 Limpiando procesos en puerto 8081..."

# Matar proceso específico del puerto 8081 usando fuser (más robusto)
fuser -k 8081/tcp >/dev/null 2>&1

# También intentar con lsof por si acaso
lsof -ti:8081 | xargs -r kill -9 >/dev/null 2>&1

# Esperar un momento
sleep 1

echo "✅ Puerto 8081 liberado"
echo "🚀 Iniciando Expo en puerto 8081..."
echo ""

# Iniciar Expo explicitamente en 8081
exec npx expo start --port 8081
