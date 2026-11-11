// Modelo de voz FM de MUCOM88 (YM2608/OPNA): parseo, serializado y conversión.
// Sin dependencias, para poder probarlo con Node y usarlo en el navegador.

export const OP_FIELDS = [
  // [clave, etiqueta, máximo]
  ['ar', 'AR', 31],
  ['dr', 'DR', 31],
  ['sr', 'SR', 31],
  ['rr', 'RR', 15],
  ['sl', 'SL', 15],
  ['tl', 'TL', 127],
  ['ks', 'KS', 3],
  ['ml', 'ML', 15],
  ['dt', 'DT', 7],
  ['am', 'AM', 1],
];

export const VOICE_RECORD_SIZE = 32; // cabecera(1) + parámetros(25) + nombre(6)
export const PARAM_BYTES = 25;
// Orden de slots en los registros del chip: op1, op3, op2, op4.
const SLOT = [0, 2, 1, 3];

export function newOp() {
  return { ar: 31, dr: 0, sr: 0, rr: 7, sl: 0, tl: 0, ks: 0, ml: 1, dt: 0, am: 0 };
}

export function newVoice(num = 0) {
  const ops = [newOp(), newOp(), newOp(), newOp()];
  ops[0].tl = 30; // modulador
  return { num, name: '', alg: 4, fb: 0, ops };
}

export function clamp(v, max) {
  v = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(max, v));
}

export function sanitize(voice) {
  voice.alg = clamp(voice.alg, 7);
  voice.fb = clamp(voice.fb, 7);
  for (const op of voice.ops)
    for (const [k, , max] of OP_FIELDS) op[k] = clamp(op[k], max);
  return voice;
}

// ---- Texto MML (formato documentado en la wiki de Open MUCOM88) ----
//   @n
//   FB,AL
//   AR,DR,SR,RR,SL,TL,KS,ML,DT   ; op1..op4
export function toMML(voice) {
  const v = sanitize(structuredClone(voice));
  const lines = [`  @${v.num}`, `${v.fb},${v.alg}`];
  v.ops.forEach((o, i) => {
    lines.push(`${o.ar},${o.dr},${o.sr},${o.rr},${o.sl},${o.tl},${o.ks},${o.ml},${o.dt} ; op${i + 1}`);
  });
  return lines.join('\n');
}

export function fromMML(text) {
  // Quita comentarios, toma "@n", luego FB,AL y 4 filas de 9 números.
  const clean = text.split('\n').map((l) => l.replace(/;.*$/, '').trim()).filter(Boolean);
  const head = clean.findIndex((l) => /^@\s*\d+/.test(l));
  if (head < 0) throw new Error('No se encontró "@n" con el número de voz');
  const num = parseInt(clean[head].replace(/^@\s*/, ''), 10);
  const nums = (l) => l.split(/[,\s]+/).filter(Boolean).map((x) => parseInt(x.replace('$', '0x'), 10));
  const [fb, alg] = nums(clean[head + 1] || '');
  const ops = [];
  for (let i = 0; i < 4; i++) {
    const r = nums(clean[head + 2 + i] || '');
    if (r.length < 9) throw new Error(`Falta la fila del operador ${i + 1} (9 valores)`);
    const [ar, dr, sr, rr, sl, tl, ks, ml, dt] = r;
    ops.push({ ar, dr, sr, rr, sl, tl, ks, ml, dt, am: 0 });
  }
  return sanitize({ num, name: '', alg, fb, ops });
}

// ---- Binario de 25 bytes ----
//   DT/ML x4, TL x4, KS/AR x4, AM/DR x4, SR x4, SL/RR x4, FB/AL
//   (en orden de slots del chip: op1, op3, op2, op4)
// Bits de cada byte que usan los campos conocidos; el resto se conserva tal cual.
const KNOWN = [0x7f,0x7f,0x7f,0x7f, 0x7f,0x7f,0x7f,0x7f, 0xdf,0xdf,0xdf,0xdf, 0x9f,0x9f,0x9f,0x9f,
  0x1f,0x1f,0x1f,0x1f, 0xff,0xff,0xff,0xff, 0x3f];

export function encode(voice) {
  const v = sanitize(structuredClone(voice));
  const b = new Uint8Array(PARAM_BYTES);
  for (let s = 0; s < 4; s++) {
    const o = v.ops[SLOT[s]];
    b[0 + s] = (o.dt << 4) | o.ml;
    b[4 + s] = o.tl;
    b[8 + s] = (o.ks << 6) | o.ar;
    b[12 + s] = (o.am << 7) | o.dr;
    b[16 + s] = o.sr;
    b[20 + s] = (o.sl << 4) | o.rr;
  }
  b[24] = (v.fb << 3) | v.alg;
  if (v.extra) for (let i = 0; i < PARAM_BYTES; i++) b[i] |= v.extra[i];
  return b;
}

export function decode(b, num = 0) {
  const ops = [0, 0, 0, 0].map(newOp);
  for (let s = 0; s < 4; s++) {
    const o = ops[SLOT[s]];
    o.dt = (b[0 + s] >> 4) & 7;
    o.ml = b[0 + s] & 15;
    o.tl = b[4 + s] & 127;
    o.ks = (b[8 + s] >> 6) & 3;
    o.ar = b[8 + s] & 31;
    o.am = (b[12 + s] >> 7) & 1;
    o.dr = b[12 + s] & 31;
    o.sr = b[16 + s] & 31;
    o.sl = (b[20 + s] >> 4) & 15;
    o.rr = b[20 + s] & 15;
  }
  const extra = Array.from({ length: PARAM_BYTES }, (_, i) => b[i] & ~KNOWN[i] & 0xff);
  const voice = { num, name: '', alg: b[24] & 7, fb: (b[24] >> 3) & 7, ops };
  if (extra.some(Boolean)) voice.extra = extra;
  return voice;
}

// ---- Banco voice.dat (formato verificado con un voice.dat real) ----
// 256 registros de 32 bytes; el registro N es la voz @N.
//   byte 0      : cabecera (0x00 en @0, 0x01 en @1, 0xFF en el resto; se conserva tal cual)
//   bytes 1-25  : 25 parámetros (DT/ML, TL, KS/AR, AM/DR, SR, SL/RR, FB/AL)
//   bytes 26-31 : nombre de 6 caracteres (relleno con espacios o ceros)
export const NAME_BYTES = 6;
export const BANK_VOICES = 256;

export function parseBank(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length % VOICE_RECORD_SIZE !== 0) throw new Error('Tamaño inválido: no es múltiplo de 32 bytes');
  const voices = [];
  for (let i = 0; i < u8.length / VOICE_RECORD_SIZE; i++) {
    const rec = u8.subarray(i * VOICE_RECORD_SIZE, (i + 1) * VOICE_RECORD_SIZE);
    const v = decode(rec.subarray(1, 1 + PARAM_BYTES), i);
    v.head = rec[0];
    v.rawName = Uint8Array.from(rec.subarray(1 + PARAM_BYTES)); // para conservar el relleno original
    v.name = new TextDecoder('latin1').decode(v.rawName).replace(/[\0\s]+$/, '');
    voices.push(v);
  }
  return voices;
}

// `voices`: lista con la propiedad `num`; los huecos quedan en cero.
export function buildBank(voices, total = BANK_VOICES) {
  const max = Math.max(total, ...voices.map((v) => v.num + 1));
  const out = new Uint8Array(max * VOICE_RECORD_SIZE);
  for (const v of voices) {
    const rec = out.subarray(v.num * VOICE_RECORD_SIZE, (v.num + 1) * VOICE_RECORD_SIZE);
    rec[0] = v.head ?? 0xff;
    rec.set(encode(v), 1);
    const orig = v.rawName ? new TextDecoder('latin1').decode(v.rawName).replace(/[\0\s]+$/, '') : null;
    if (v.rawName && orig === (v.name || '')) {
      rec.set(v.rawName, 1 + PARAM_BYTES); // nombre sin cambios: bytes originales
    } else {
      const name = (v.name || '').slice(0, NAME_BYTES).padEnd(v.name ? NAME_BYTES : 0, ' ');
      for (let k = 0; k < name.length; k++) rec[1 + PARAM_BYTES + k] = name.charCodeAt(k) & 0x7f;
    }
  }
  return out;
}

// Operadores portadores (los que suenan) según el algoritmo, índices 0..3 = op1..op4
export const CARRIERS = {
  0: [3], 1: [3], 2: [3], 3: [3], 4: [1, 3], 5: [1, 2, 3], 6: [1, 2, 3], 7: [0, 1, 2, 3],
};
