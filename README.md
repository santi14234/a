# 88play para Android (con editor de instrumentos FM)

Empaqueta [88play](https://github.com/digital-sound-antiques/88play) (MUCOM88 en el navegador) como app Android con Capacitor, y le agrega un editor de voces FM de 4 operadores como el de la versión de Windows.

## Cómo obtener el APK

**Opción A – GitHub Actions (sin instalar nada):**
1. Subí esta carpeta a un repositorio nuevo en GitHub.
2. En la pestaña *Actions* ejecutá **Build APK** (o hacé un push a `main`).
3. Al terminar, descargá el artefacto `88play-debug-apk` e instalá `app-debug.apk` en el teléfono (habilitá "instalar apps desconocidas").

**Opción B – local:** con Node 20+, Java 17 y Android SDK (`ANDROID_HOME`):
```
npm run build
```
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## Qué hace el build
`www/index.html` es un único HTML con 88play (v1.3.2), el editor FM y todo lo que la web carga en tiempo de ejecución
(worker del compilador con el wasm, worklet de audio y samples de ritmo). El build solo lo empaqueta con Capacitor.
Se regenera con `scripts/build-html.py` (ver su cabecera).

## Editor FM (botón naranja "FM")
- Banco de voces: nueva, duplicar, borrar, número y nombre (7 caracteres).
- ALG y FB, y por operador: AR, DR, SR, RR, SL, TL, KS, ML, DT, AM, con gráfico de envolvente. Se resaltan los portadores según el algoritmo.
- Texto MML de la voz editable (formato `@n / FB,AL / AR,DR,SR,RR,SL,TL,KS,ML,DT`).
- **Insertar en MML**: pega la definición en el cursor del editor de 88play.
- **Probar**: carga una canción de prueba con la voz y pulsa *Compile*, así suena con el motor real de MUCOM88 (no con un sintetizador aparte). **Restaurar canción** devuelve tu texto original.
- Abrir/guardar `voice.dat`.

## Verificado y no verificado
- **Verificado en Chromium:** carga sin errores, compila MML con el motor real de MUCOM88, el aviso de `#pcm`/`#voice` aparece al escribir, y el editor FM abre y su botón *Probar* compila la voz. `voice.dat` real: abrir y guardar da el mismo archivo byte a byte.
- **No verificado:** que suene en un teléfono (el navegador de prueba no tiene salida de audio), ni la instalación del APK.
- **Abrir el HTML suelto (`file://`) no da audio:** Chromium no deja cargar el worklet desde un blob con origen `null`. Funciona servido por HTTP (GitHub Pages) o dentro de la app Capacitor.
- **Guardar `voice.dat` en Android:** usa una descarga normal del navegador; el WebView de Capacitor puede no permitirlo. Si falla, hay que usar el plugin Filesystem/Share.
- Falta el logo `88play-*.svg` (no se descargó); solo afecta la imagen del encabezado.
- El gráfico de envolvente es aproximado.

## Licencia
88play y Open MUCOM88 son **CC BY-NC-SA 4.0**: uso no comercial, con atribución y misma licencia para derivados. Este proyecto hereda esa licencia. Créditos: Yuzo Koshiro (MUCOM88), ONION software/onitama (Open MUCOM88), Digital Sound Antiques (88play).
