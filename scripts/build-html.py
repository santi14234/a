#!/usr/bin/env python3
"""Arma un único 88play.html a partir de los archivos guardados de la web.

Uso:
  python3 -I scripts/build-html.py --src DIR_CON_INDEX_JS_CSS [--assets DIR] --out 88play.html

--src    carpeta con index-*.js(.descarga) e index-*.css
--assets carpeta con renderer-worklet-*.js, mucom-decoder-worker-*.js y 2608_*.wav (opcional;
         sin ellos el HTML se genera pero no suena)
"""
import argparse, base64, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(p, encoding='utf-8', errors='replace') as f:
        return f.read()


def replace_once(s, old, new, what):
    n = s.count(old)
    if n != 1:
        sys.exit(f'ERROR: "{what}" aparece {n} veces (se esperaba 1). El bundle cambió.')
    return s.replace(old, new)


def find(dirpath, pattern):
    hits = sorted(glob.glob(os.path.join(dirpath, pattern)))
    return hits[0] if hits else None


# ---------------- parches al bundle de 88play ----------------
def patch_bundle(js):
    # 1) Recalcular los archivos pendientes (#pcm / #voice) al editar el texto.
    #    Antes solo se recalculaba al abrir archivos, así que escribir "#pcm x.bin" no avisaba.
    js = replace_once(
        js,
        'we(this,"onChangeText",e=>{this.updateText(e)})',
        'we(this,"onChangeText",e=>{this.updateText(e),clearTimeout(this.__urT),'
        'this.__urT=setTimeout(()=>this.updateUnresolvedResources(e),300)})',
        'onChangeText',
    )
    # 2) Traducción al español (el resto cae al inglés).
    es = ('es:{translation:{share:{unresolvedMessage:"Hay que seleccionar {{file}} antes de compartir. '
          'Si no hace falta, quitá la etiqueta #{{tag}} del MML."},'
          'alert:{unresolvedResources:{message_one:"Falta el archivo: {{file}}. Seleccionalo o arrastralo al editor.",'
          'message_other:"Faltan los archivos: {{file}}. Seleccionalos o arrastralos al editor.",'
          'buttonLabel:"Seleccionar..."}}}},')
    js = replace_once(js, 'ja:{translation:{menu:{file:{new:"新規作成"', es + 'ja:{translation:{menu:{file:{new:"新規作成"', 'bloque ja')
    return js


# ---------------- embebido de archivos externos ----------------
B64_HELPER = ('const __asset=(b,t)=>URL.createObjectURL(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:t}));\n')


def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode()


def embed_assets(js, adir):
    report = []
    # AudioWorklet
    m = re.search(r'""\+new URL\("(renderer-worklet-[\w-]+\.js)",import\.meta\.url\)\.href', js)
    if m:
        p = os.path.join(adir, m.group(1))
        if os.path.exists(p):
            js = js.replace(m.group(0), f'__asset("{b64(p)}","text/javascript")'); report.append(m.group(1))
    # Worker del decodificador (módulo). Pide los .wav con new URL(nombre, self.location.href);
    # dentro de un blob esas rutas no resuelven, así que se reescriben como data: URLs.
    m = re.search(r'new URL\(""\+new URL\("(mucom-decoder-worker-[\w-]+\.js)",import\.meta\.url\)\.href,import\.meta\.url\)', js)
    if m:
        p = os.path.join(adir, m.group(1))
        if os.path.exists(p):
            w = read(p)
            for wav in set(re.findall(r'""\+new URL\("([\w-]+\.wav)",self\.location\.href\)\.href', w)):
                wp = os.path.join(adir, wav)
                if os.path.exists(wp):
                    w = w.replace(f'""+new URL("{wav}",self.location.href).href', f'"data:audio/wav;base64,{b64(wp)}"'); report.append('worker:' + wav)
            data = base64.b64encode(w.encode('utf-8')).decode()
            js = js.replace(m.group(0), f'__asset("{data}","text/javascript")'); report.append(m.group(1))
    # Samples del ritmo (wav) y logo
    for m in set(re.findall(r'""\+new URL\("([\w-]+\.(?:wav|svg))",import\.meta\.url\)\.href', js)):
        p = os.path.join(adir, m)
        if os.path.exists(p):
            mime = 'audio/wav' if m.endswith('.wav') else 'image/svg+xml'
            js = js.replace(f'""+new URL("{m}",import.meta.url).href', f'"data:{mime};base64,{b64(p)}"'); report.append(m)
    return js, report


def missing_assets(js, adir):
    names = set(re.findall(r'new URL\("([\w-]+\.(?:wav|svg|js))",import\.meta\.url\)', js))
    return sorted(n for n in names if not (adir and os.path.exists(os.path.join(adir, n))))


# ---------------- editor FM (un solo módulo) ----------------
def editor_module():
    voice = read(os.path.join(ROOT, 'fm-editor/fm-voice.js'))
    ui = read(os.path.join(ROOT, 'fm-editor/fm-editor.js'))
    voice = re.sub(r'^export\s+', '', voice, flags=re.M)
    ui = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'\./fm-voice\.js';\n", '', ui, flags=re.M | re.S)
    ui = re.sub(r"^import\s+'[^']+';\n", '', ui, flags=re.M)
    ui = re.sub(r'^export\s*\{[^}]*\};.*\n?', '', ui, flags=re.M)
    return '(()=>{\n' + voice + '\n' + ui + '\n})();'


def safe_script(js):
    # Evita que el HTML cierre el <script> o abra un comentario HTML dentro del JS.
    js = js.replace('</script', '<\\/script').replace('<!--', '<\\!--')
    return js


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--assets')
    ap.add_argument('--out', default='88play.html')
    a = ap.parse_args()

    jsf = find(a.src, 'index-*.js*') or sys.exit('No encuentro index-*.js en --src')
    cssf = find(a.src, 'index-*.css') or sys.exit('No encuentro index-*.css en --src')
    js = patch_bundle(read(jsf))
    missing = missing_assets(js, a.assets)
    report = []
    if a.assets:
        js, report = embed_assets(js, a.assets)
    css = re.sub(r'@font-face\{[^}]*\}', '', read(cssf))          # sin fuentes externas: usa la del sistema
    fme_css = read(os.path.join(ROOT, 'fm-editor/fm-editor.css'))

    html = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0f0b09">
<title>88play</title>
<style>{css}</style>
<style id="fme-css">{fme_css}</style>
</head><body><div id="root"></div>
<script type="module">
{safe_script(B64_HELPER + js)}
</script>
<script type="module">
{safe_script(editor_module())}
</script>
</body></html>
'''
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'OK -> {a.out} ({len(html)/1024/1024:.2f} MB)')
    print('embebidos:', report or 'ninguno')
    print('FALTAN:', missing or 'nada')


if __name__ == '__main__':
    main()
