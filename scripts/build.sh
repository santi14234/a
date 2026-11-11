#!/usr/bin/env bash
# Construye 88play + editor FM y lo empaqueta como APK con Capacitor.
# Requisitos: Node 20+, Java 17, Android SDK (ANDROID_HOME). Necesita red.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1) La app web ya viene armada en www/index.html (88play + editor FM + archivos embebidos).
#    Para regenerarla: python3 -I scripts/build-html.py --src <carpeta> --assets <carpeta> --out www/index.html
[ -f www/index.html ] || { echo "Falta www/index.html"; exit 1; }

# 4) Capacitor: generar proyecto Android si no existe, sincronizar y compilar
npm install
[ -d android ] || npx cap add android
npx cap sync android
( cd android && ./gradlew assembleDebug )
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
