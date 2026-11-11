import * as V from '../fm-editor/fm-voice.js';
import { readFileSync, existsSync } from 'node:fs';
// Voz de ejemplo de la wiki de Open MUCOM88 (ida y vuelta binaria)
const raw = Uint8Array.from([0x73,0x54,0x73,0x54,0x1A,0x19,0,0,0x1F,0x1F,0x1F,0x1F,0x80,0x80,0x80,0x80,0,0,1,1,0x0F,0x0F,0x3F,0x3F,0x34]);
const v = V.decode(raw, 5);
console.log('bytes roundtrip:', Buffer.from(V.encode(v)).equals(Buffer.from(raw)));
const v2 = V.fromMML(V.toMML(v)); v2.ops.forEach((o,i)=>o.am=v.ops[i].am);
console.log('MML roundtrip:', JSON.stringify(v2.ops)===JSON.stringify(v.ops));
// voice.dat real (ruta opcional por argumento)
const p = process.argv[2];
if (p && existsSync(p)) {
  const orig = new Uint8Array(readFileSync(p));
  const bank = V.parseBank(orig);
  console.log('voces:', bank.length, '| @1:', bank[1].name, '| @13:', bank[13].name, '| @0:', bank[0].name);
  const used = bank.filter(b => b.head === 0xff || b.head === 1 || b.head === 0).filter(b => encodeNonZero(b));
  function encodeNonZero(b){ return V.encode(b).some(x=>x); }
  const rebuilt = V.buildBank(bank);
  let diff = 0, first = -1;
  for (let i=0;i<orig.length;i++) if (orig[i]!==rebuilt[i]) { diff++; if(first<0) first=i; }
  console.log('bytes distintos tras parse→build:', diff, first>=0?`(primero en ${first})`:'');
}
