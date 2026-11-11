// Editor de instrumentos FM para 88play (UI táctil).
// Se carga como <script type="module"> sobre la app ya construida.
// Se conecta al editor Ace de 88play (#mml_editor) para insertar voces y previsualizarlas
// con el motor real de MUCOM88, sin tocar el código de 88play.
import {
  OP_FIELDS, CARRIERS, newVoice, sanitize, toMML, fromMML,
  encode, parseBank, buildBank,
} from './fm-voice.js';

const LS_KEY = 'fm-editor-bank-v1';
const state = { bank: [], cur: 0, backup: null };

function loadBank() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) return raw.map(sanitize);
  } catch { /* storage no disponible */ }
  return [newVoice(0)];
}
function saveBank() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.bank)); } catch { /* ignorar */ }
}

// ---------- puente con 88play ----------
function aceEditor() {
  const el = document.getElementById('mml_editor');
  return el && el.env && el.env.editor ? el.env.editor : null;
}
function clickByText(txt) {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\s+/g, '').includes(txt));
  if (b) b.click();
  return !!b;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'fme-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function insertIntoEditor() {
  const ed = aceEditor();
  const text = '\n' + toMML(state.bank[state.cur]) + '\n';
  if (!ed) { navigator.clipboard?.writeText(text); return toast('Editor no encontrado: copiado al portapapeles'); }
  ed.session.insert(ed.getCursorPosition(), text);
  toast(`Voz @${state.bank[state.cur].num} insertada en el MML`);
}

function previewVoice() {
  const ed = aceEditor();
  if (!ed) return toast('No encuentro el editor MML de 88play');
  if (state.backup === null) state.backup = ed.getValue();
  const v = state.bank[state.cur];
  const song = [
    '#mucom88 1.7', '#title FM Preview', '', toMML(v), '',
    `A t120 @${v.num} o4 v12 l4 cdefgr2 gfedc2 r2 L`,
  ].join('\n');
  ed.setValue(song, 1);
  if (!clickByText('Compile')) toast('Texto de prueba cargado; pulsá Compile');
  document.querySelector('.fme-restore').hidden = false;
}

function restoreSong() {
  const ed = aceEditor();
  if (ed && state.backup !== null) ed.setValue(state.backup, 1);
  state.backup = null;
  document.querySelector('.fme-restore').hidden = true;
}

// ---------- archivos ----------
function download(name, bytes, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function pickFile(accept, cb) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept;
  i.onchange = async () => { if (i.files[0]) cb(new Uint8Array(await i.files[0].arrayBuffer()), i.files[0].name); };
  i.click();
}

// ---------- UI ----------
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function slider(label, value, max, onInput, dim) {
  const wrap = el('label', 'fme-row' + (dim ? ' dim' : ''));
  const name = el('span', 'fme-lbl', label);
  const input = el('input');
  input.type = 'range'; input.min = 0; input.max = max; input.value = value;
  const num = el('output', 'fme-val', String(value));
  input.oninput = () => { num.textContent = input.value; onInput(parseInt(input.value, 10)); };
  wrap.append(name, input, num);
  return wrap;
}

function envelopeCanvas(op) {
  const c = el('canvas', 'fme-env');
  c.width = 300; c.height = 60;
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  const level = (127 - op.tl) / 127;                   // nivel de salida
  const sus = level * (1 - op.sl / 15);                // nivel de sustain
  const atk = Math.max(6, (32 - op.ar) * 3);
  const dec = op.dr === 0 ? 0 : Math.max(6, (32 - op.dr) * 3);
  const rel = Math.max(6, (16 - op.rr) * 5);
  let x = 4;
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--fme-accent') || '#e0a050';
  g.lineWidth = 2; g.beginPath(); g.moveTo(x, h - 4);
  x += atk; g.lineTo(x, h - 4 - level * (h - 10));
  x += dec; g.lineTo(x, h - 4 - sus * (h - 10));
  x += Math.min(80, w - x - rel - 4); g.lineTo(x, h - 4 - sus * (h - 10) * (op.sr ? 0.8 : 1));
  x += rel; g.lineTo(Math.min(x, w - 2), h - 4);
  g.stroke();
  return c;
}

function render(root) {
  const v = state.bank[state.cur];
  root.querySelector('.fme-body').replaceChildren();
  const body = root.querySelector('.fme-body');
  const refresh = () => { saveBank(); render(root); };

  // Selector de voz
  const bar = el('div', 'fme-bar');
  const sel = el('select');
  state.bank.forEach((x, i) => {
    const o = el('option', '', `@${x.num} ${x.name || ''}`);
    o.value = i; sel.append(o);
  });
  sel.value = state.cur;
  sel.onchange = () => { state.cur = parseInt(sel.value, 10); render(root); };
  const nameIn = el('input'); nameIn.placeholder = 'Nombre (máx 6)'; nameIn.maxLength = 6; nameIn.value = v.name || '';
  nameIn.oninput = () => { v.name = nameIn.value; saveBank(); };
  const numIn = el('input'); numIn.type = 'number'; numIn.min = 0; numIn.max = 255; numIn.value = v.num; numIn.title = 'Número de voz';
  numIn.onchange = () => { v.num = Math.max(0, Math.min(255, parseInt(numIn.value, 10) || 0)); refresh(); };
  const add = el('button', '', '+ Nueva');
  add.onclick = () => { state.bank.push(newVoice(Math.max(...state.bank.map((b) => b.num)) + 1)); state.cur = state.bank.length - 1; refresh(); };
  const dup = el('button', '', 'Duplicar');
  dup.onclick = () => { const c = structuredClone(v); c.num = Math.max(...state.bank.map((b) => b.num)) + 1; state.bank.push(c); state.cur = state.bank.length - 1; refresh(); };
  const del = el('button', '', 'Borrar');
  del.onclick = () => { if (state.bank.length > 1 && confirm(`¿Borrar @${v.num}?`)) { state.bank.splice(state.cur, 1); state.cur = 0; refresh(); } };
  bar.append(sel, numIn, nameIn, add, dup, del);
  body.append(bar);

  // Algoritmo y feedback
  const top = el('div', 'fme-card');
  top.append(el('h3', '', 'Algoritmo / Feedback'));
  top.append(slider('ALG', v.alg, 7, (n) => { v.alg = n; saveBank(); render(root); }));
  top.append(slider('FB', v.fb, 7, (n) => { v.fb = n; saveBank(); }));
  top.append(el('small', '', `Portadores (suenan): ${CARRIERS[v.alg].map((i) => 'op' + (i + 1)).join(', ')}`));
  body.append(top);

  // 4 operadores
  v.ops.forEach((op, i) => {
    const card = el('div', 'fme-card' + (CARRIERS[v.alg].includes(i) ? ' carrier' : ''));
    card.append(el('h3', '', `Operador ${i + 1}${CARRIERS[v.alg].includes(i) ? ' · portador' : ' · modulador'}`));
    OP_FIELDS.forEach(([k, label, max]) => {
      card.append(slider(label, op[k], max, (n) => { op[k] = n; saveBank(); const old = card.querySelector('canvas'); old.replaceWith(envelopeCanvas(op)); }));
    });
    card.append(envelopeCanvas(op));
    body.append(card);
  });

  // MML en texto
  const mml = el('textarea', 'fme-mml');
  mml.value = toMML(v); mml.rows = 7; mml.spellcheck = false;
  const apply = el('button', '', 'Aplicar texto');
  apply.onclick = () => { try { const n = fromMML(mml.value); n.name = v.name; state.bank[state.cur] = n; refresh(); } catch (e) { toast(e.message); } };
  const mcard = el('div', 'fme-card'); mcard.append(el('h3', '', 'MML de la voz'), mml, apply);
  body.append(mcard);
}

function build() {
  if (!document.getElementById('fme-css')) { // en el HTML único el CSS ya va incrustado
    const style = el('link'); style.rel = 'stylesheet'; style.href = new URL('./fm-editor.css', import.meta.url).href;
    document.head.append(style);
  }

  const fab = el('button', 'fme-fab', 'FM');
  fab.title = 'Editor de instrumentos FM';
  const root = el('div', 'fme-root'); root.hidden = true;
  root.innerHTML = `
    <div class="fme-head">
      <strong>Editor FM</strong>
      <span class="fme-grow"></span>
      <button class="fme-close" aria-label="Cerrar">✕</button>
    </div>
    <div class="fme-body"></div>
    <div class="fme-foot">
      <button class="fme-prev">▶ Probar</button>
      <button class="fme-restore" hidden>Restaurar canción</button>
      <button class="fme-ins">Insertar en MML</button>
      <button class="fme-imp">Abrir voice.dat</button>
      <button class="fme-exp">Guardar voice.dat</button>
    </div>`;
  document.body.append(fab, root);

  fab.onclick = () => { root.hidden = false; state.bank = state.bank.length ? state.bank : loadBank(); render(root); };
  root.querySelector('.fme-close').onclick = () => { root.hidden = true; };
  root.querySelector('.fme-prev').onclick = previewVoice;
  root.querySelector('.fme-restore').onclick = restoreSong;
  root.querySelector('.fme-ins').onclick = insertIntoEditor;
  root.querySelector('.fme-imp').onclick = () => pickFile('.dat,.bin,*/*', (bytes) => {
    const voices = parseBank(bytes);
    if (!voices.length) return toast('El archivo no tiene voces');
    state.bank = voices; state.cur = 0; saveBank(); render(root);
    toast(`${voices.length} voces cargadas`);
  });
  root.querySelector('.fme-exp').onclick = () => download('voice.dat', buildBank(state.bank));
}

state.bank = loadBank();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
else build();

export { encode }; // útil para depurar desde la consola
