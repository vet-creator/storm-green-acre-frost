/**
 * Seal Abyssal Castle into an AES-256-GCM payload.
 * The HTML the browser ships has no game source. Half of the key never
 * appears in that file; it is released only by the server at runtime.
 * The other half is the output of a per-build bytecode program, not a literal.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const acorn = require("acorn");

const SRC = "/workspace/attachments/abyssal castle5 rpg.html";
const OUT_HTML = "/workspace/public/citadel.html";
const OUT_SHARD = "/workspace/src/server/citadel-shard.server.ts";

const OPS = ["HALT", "PUSH", "XOR", "ADD", "SUB", "ROL", "DUP", "SWAP", "DROP", "STORE", "MUL", "AND"];

function stripCssComments(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += q;
      i++;
      while (i < css.length) {
        out += css[i];
        if (css[i] === "\\") {
          i++;
          if (i < css.length) out += css[i];
          i++;
          continue;
        }
        if (css[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      i += 2;
      while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) {
        if (css[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      out += " ";
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function stripJsComments(code) {
  const comments = [];
  acorn.parse(code, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowReturnOutsideFunction: true,
    onComment: (_block, _text, start, end) => comments.push([start, end]),
  });
  const chars = code.split("");
  for (const [start, end] of comments) {
    for (let i = start; i < end; i++) if (chars[i] !== "\n") chars[i] = " ";
  }
  return chars.join("");
}

function sealSource(html) {
  const styleOpen = html.indexOf("<style>");
  const styleClose = html.indexOf("</style>");
  const scriptOpen = html.indexOf("<script>");
  const scriptClose = html.indexOf("</script>");
  if (styleOpen < 0 || scriptOpen < 0) throw new Error("style/script not found");
  const styleBody = html.slice(styleOpen + "<style>".length, styleClose);
  let scriptBody = html.slice(scriptOpen + "<script>".length, scriptClose);
  const replaced = scriptBody.replace(
    /window\.__AC3\s*=\s*\{[\s\S]*?get WORLD\(\)\{ return WORLD; \} \};/,
    "try{Object.defineProperty(window,'__AC3',{configurable:false,enumerable:false,writable:false,value:void 0});}catch(_e){}",
  );
  if (replaced === scriptBody) throw new Error("debug export not found");
  scriptBody = replaced;
  const strippedJs = stripJsComments(scriptBody);
  new Function(strippedJs);
  const strippedCss = stripCssComments(styleBody);
  return (
    html.slice(0, styleOpen + "<style>".length) +
    strippedCss +
    html.slice(styleClose, scriptOpen + "<script>".length) +
    strippedJs +
    html.slice(scriptClose)
  );
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildProgram(clientHalf, rnd) {
  const order = shuffle(OPS, rnd);
  const op = {};
  order.forEach((name, i) => {
    op[name] = i;
  });
  const prog = [];
  const emit = (...xs) => prog.push(...xs);
  const junk = () => {
    const n = 2 + rnd(5);
    for (let k = 0; k < n; k++) {
      const kind = rnd(4);
      if (kind === 0) emit(op.PUSH, rnd(256), op.DROP);
      else if (kind === 1) emit(op.PUSH, rnd(256), op.PUSH, rnd(256), op.XOR, op.DROP);
      else if (kind === 2) emit(op.PUSH, rnd(256), op.DUP, op.DROP, op.DROP);
      else emit(op.PUSH, rnd(256), op.PUSH, rnd(256), op.SWAP, op.DROP, op.DROP);
    }
  };
  clientHalf.forEach((target, idx) => {
    junk();
    const a = rnd(256);
    const b = rnd(256);
    const c = rnd(256);
    const mid = (a ^ b ^ c) & 255;
    const k = mid ^ target;
    emit(op.PUSH, a, op.PUSH, b, op.XOR, op.PUSH, c, op.XOR, op.PUSH, k, op.XOR, op.STORE, idx);
    junk();
  });
  emit(op.HALT);
  return { op, prog };
}

function vmSource() {
  return `
function vm(P, prog) {
  var st = [], key = new Uint8Array(16), i = 0, o, a, b, n;
  while (i < prog.length) {
    o = prog[i++];
    if (o === P[0]) break;
    else if (o === P[1]) st.push(prog[i++]);
    else if (o === P[2]) { b = st.pop(); a = st.pop(); st.push((a ^ b) & 255); }
    else if (o === P[3]) { b = st.pop(); a = st.pop(); st.push((a + b) & 255); }
    else if (o === P[4]) { b = st.pop(); a = st.pop(); st.push((a - b) & 255); }
    else if (o === P[5]) { n = st.pop() & 7; a = st.pop(); st.push(((a << n) | (a >>> (8 - n))) & 255); }
    else if (o === P[6]) st.push(st[st.length - 1]);
    else if (o === P[7]) { b = st.pop(); a = st.pop(); st.push(b); st.push(a); }
    else if (o === P[8]) st.pop();
    else if (o === P[9]) { key[prog[i++]] = st.pop() & 255; }
    else if (o === P[10]) { b = st.pop(); a = st.pop(); st.push((a * b) & 255); }
    else if (o === P[11]) { b = st.pop(); a = st.pop(); st.push(a & b); }
    else throw new Error('op');
  }
  return key;
}`;
}

function mixKey(client, server) {
  const key = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    key[i] = client[i] ^ server[i];
    key[16 + i] =
      ((client[i] + server[(i * 5 + 3) & 15] * 3) & 255) ^ client[(i * 7 + 1) & 15];
  }
  return key;
}

function chars(s) {
  return "[" + [...s].map((c) => c.charCodeAt(0)).join(",") + "]";
}

function b64(buf) {
  return Buffer.from(buf).toString("base64");
}

function buildLoader({ op, prog, iv, ct }) {
  const P = `[${OPS.map((name) => op[name]).join(",")}]`;
  return `(async function(){
var S=function(a){var s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return s;};
var P=${P};
var prog=Uint8Array.from([${prog.join(",")}]);
${vmSource()}
var client=vm(P,prog);
var host=location.hostname.toLowerCase();
var path=location.pathname;
var m=path.match(/^\\/hds-[a-z0-9]+-\\d+-[a-z0-9]+/i);
var hosts=[S(${chars("preview.grok.genai.mil")}),S(${chars("preview.grok.mil")}),S(${chars("preview.grokgsac.com")})];
var pre=(m&&(host===hosts[0]||host===hosts[1]||host===hosts[2]))?m[0]:'';
var res=await fetch(pre+S(${chars("/api/citadel-shard")}),{cache:'no-store',credentials:'same-origin'});
if(!res.ok) throw 0;
var server=new Uint8Array(await res.arrayBuffer());
if(server.length!==16) throw 0;
var key=new Uint8Array(32);
for(var i=0;i<16;i++){
  key[i]=client[i]^server[i];
  key[16+i]=((client[i]+server[(i*5+3)&15]*3)&255)^client[(i*7+1)&15];
}
var b64d=function(s){return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0);});};
var iv=b64d('${b64(iv)}');
var ct=b64d('${b64(ct)}');
var alg=S(${chars("AES-GCM")});
var ck=await crypto.subtle.importKey('raw',key,{name:alg},false,[S(${chars("decrypt")})]);
var raw=new Uint8Array(await crypto.subtle.decrypt({name:alg,iv:iv},ck,ct));
key.fill(0); client.fill(0); server.fill(0);
var ds=new DecompressionStream(S(${chars("deflate-raw")}));
var html=await new Response(new Blob([raw]).stream().pipeThrough(ds)).text();
raw=null;
var doc=new DOMParser().parseFromString(html,'text/html');
html='';
document.title=doc.title||document.title;
if(doc.documentElement.lang) document.documentElement.lang=doc.documentElement.lang;
var metas=doc.head.querySelectorAll('meta');
for(var mi=0;mi<metas.length;mi++){var mn=metas[mi]; if(mn.hasAttribute('charset')) continue; document.head.appendChild(document.adoptNode(mn));}
var styles=doc.head.querySelectorAll('style');
for(var si=0;si<styles.length;si++) document.head.appendChild(document.adoptNode(styles[si]));
var tags=doc.getElementsByTagName('script');
var srcs=[];
for(var ti=0;ti<tags.length;ti++) srcs.push(tags[ti].textContent||'');
while(tags.length) tags[0].remove();
var nodes=[];
while(doc.body.firstChild) nodes.push(document.adoptNode(doc.body.firstChild));
document.body.removeAttribute('style');
document.body.replaceChildren.apply(document.body, nodes);
var ots=Function.prototype.toString;
var hid=typeof WeakSet==='function'?new WeakSet():null;
Function.prototype.toString=function(){ if(hid&&hid.has(this)) return S(${chars("function(){}")}); return ots.call(this); };
for(var fi=0;fi<srcs.length;fi++){
  var code=srcs[fi]; srcs[fi]='';
  if(!code||!code.trim()) continue;
  var fn=new Function(code);
  if(hid) hid.add(fn);
  code='';
  fn();
}
})().catch(function(err){
  try{ console.error(err); }catch(e){}
  document.body.textContent='';
  document.body.style.background='#04060c';
});
`;
}

function xorEncode(text, a, c) {
  const buf = Buffer.from(text, "utf8");
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ ((a + i * c) & 255);
  return out.toString("base64");
}

function page(blob, a, c) {
  const stub = `(function(){var e=document.getElementById('s');var bin=atob(e.getAttribute('data-b'));e.removeAttribute('data-b');var a=${a},c=${c},o='';for(var i=0;i<bin.length;i++)o+=String.fromCharCode(bin.charCodeAt(i)^((a+i*c)&255));e.textContent='';(0,eval)(o);})();`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\u200b</title><script id="s" data-b="${blob}">${stub}</script></head><body style="margin:0;background:#04060c"></body></html>`;
}

async function assertRoundtrip(loader, plain, server) {
  const vmFn = new Function(
    `${vmSource()}; return vm;`,
  )();
  const Pmatch = loader.match(/var P=(\[[0-9,]+\]);/);
  const progMatch = loader.match(/var prog=Uint8Array\.from\(\[([0-9,]*)\]\);/);
  if (!Pmatch || !progMatch) throw new Error("loader shape");
  const P = JSON.parse(Pmatch[1]);
  const prog = Uint8Array.from(progMatch[1].split(",").map(Number));
  const client = vmFn(P, prog);
  const key = mixKey(client, server);
  const iv = Buffer.from(loader.match(/var iv=b64d\('([^']+)'\);/)[1], "base64");
  const ct = Buffer.from(loader.match(/var ct=b64d\('([^']+)'\);/)[1], "base64");
  const tag = ct.subarray(ct.length - 16);
  const data = ct.subarray(0, ct.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const raw = Buffer.concat([decipher.update(data), decipher.final()]);
  const back = new TextDecoder().decode(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
    ).arrayBuffer(),
  );
  if (back !== plain) throw new Error("roundtrip mismatch");
  if (back.includes("window.__AC3 =")) throw new Error("debug export survived");
  if (back.includes("Principle of the third citadel")) throw new Error("law comments survived");
}

function shardModule(server) {
  const list = [...server].join(",");
  return `// Generated by the citadel seal. Server-only key half. Not part of the client bundle.\nexport const CITADEL_SHARD = new Uint8Array([${list}]);\n`;
}

async function main() {
  const original = readFileSync(SRC, "utf8");
  const plain = sealSource(original);
  const deflated = zlib.deflateRawSync(Buffer.from(plain, "utf8"), { level: 9 });
  const key = crypto.randomBytes(32);
  const client = crypto.randomBytes(16);
  const server = crypto.randomBytes(16);
  const mixed = mixKey(client, server);
  if (Buffer.compare(mixed, key) === 0) throw new Error("unexpected key collision path");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", mixKey(client, server), iv);
  const enc = Buffer.concat([cipher.update(deflated), cipher.final()]);
  const ct = Buffer.concat([enc, cipher.getAuthTag()]);
  const rnd = (n) => crypto.randomBytes(1)[0] % n;
  const built = buildProgram(client, rnd);
  for (let i = 0; i < 16; i++) {
    /* sanity: program must reproduce client bytes; checked in assertRoundtrip */
    void i;
  }
  const loader = buildLoader({ op: built.op, prog: built.prog, iv, ct });
  if (/[^\x00-\x7f]/.test(loader)) throw new Error("loader must stay ASCII");
  new Function(loader.replace(/^\(async function\(\)\{/, "async function __seal(){").replace(/\}\)\(\)\.catch[\s\S]*$/, "}"));
  await assertRoundtrip(loader, plain, server);
  const a = 1 + (crypto.randomBytes(1)[0] % 200);
  const c = 1 + (crypto.randomBytes(1)[0] % 200);
  const blob = xorEncode(loader, a, c);
  mkdirSync(dirname(OUT_HTML), { recursive: true });
  mkdirSync(dirname(OUT_SHARD), { recursive: true });
  writeFileSync(OUT_HTML, page(blob, a, c));
  writeFileSync(OUT_SHARD, shardModule(server));
  const sealed = readFileSync(OUT_HTML, "utf8");
  const leaked = ["quandle", "GW1", "mulberry32", "ABYSSAL", "__AC3", "AES-GCM", "deflate-raw"];
  for (const word of leaked) {
    if (sealed.includes(word)) throw new Error("sealed file leaked " + word);
  }
  console.log(
    JSON.stringify({
      plain: plain.length,
      deflated: deflated.length,
      sealed: sealed.length,
      prog: built.prog.length,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
