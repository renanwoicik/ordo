/* =========================================================
   Sistema · criptografia
   Usa apenas o "Web Crypto", que já vem dentro do Safari e
   do Chrome (nenhuma biblioteca de terceiros).

   Como funciona, em palavras simples:
   - Existe UMA chave mestra, sorteada no primeiro acesso.
     Ela embaralha (AES-GCM 256) cada registro guardado.
   - A chave mestra nunca é guardada "aberta". Ela é guardada
     trancada duas vezes:
       1) com a sua senha;
       2) com a chave de recuperação.
     Qualquer uma das duas destranca a chave mestra.
   - Trocar a senha só tranca a chave mestra de novo; os dados
     não precisam ser reembaralhados.
   ========================================================= */

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

/** Quantas voltas o PBKDF2 dá na senha (deixa tentativas de adivinhar bem lentas). */
export const VOLTAS_SENHA = 310000;
/** A chave de recuperação já é aleatória e longa, então precisa de menos voltas. */
export const VOLTAS_CHAVE_REC = 100000;

export const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

/* ---------- bytes ⇄ texto (base64) ---------- */
export function paraB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function deB64(texto) {
  const s = atob(texto);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* ---------- chaves ---------- */

/** Transforma uma senha (ou a chave de recuperação) numa chave que tranca/destranca a chave mestra. */
export async function chaveDaSenha(senha, sal, voltas) {
  const base = await crypto.subtle.importKey('raw', codificador.encode(String(senha).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: voltas, hash: 'SHA-256' },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Sorteia uma chave mestra nova. */
export const novaChaveMestra = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

/** Tranca a chave mestra com outra chave → bytes que podem ser guardados. */
export async function trancar(chaveMestra, tranca) {
  return new Uint8Array(await crypto.subtle.wrapKey('raw', chaveMestra, tranca, 'AES-KW'));
}

/** Destranca a chave mestra. Se a senha estiver errada, dá erro (o AES-KW confere a integridade). */
export function destrancar(bytes, tranca) {
  return crypto.subtle.unwrapKey('raw', bytes, tranca, 'AES-KW', { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/* ---------- embaralhar / desembaralhar um registro ---------- */

export async function cifrar(chaveMestra, objeto) {
  const iv = aleatorio(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chaveMestra, codificador.encode(JSON.stringify(objeto)));
  return { iv: paraB64(iv), ct: paraB64(new Uint8Array(ct)) };
}

export async function decifrar(chaveMestra, { iv, ct }) {
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, chaveMestra, deB64(ct));
  return JSON.parse(decodificador.decode(claro));
}

/* ---------- chave de recuperação ---------- */
// 32 caracteres sorteados entre letras/números fáceis de ler
// (sem 0/O nem 1/I/L), em 8 grupos de 4: "K7QM-2XRA-...".

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function novaChaveRecuperacao() {
  const bytes = aleatorio(32);
  let s = '';
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return s.match(/.{4}/g).join('-');
}

/** Aceita a chave digitada com ou sem traços, maiúsculas ou minúsculas. */
export const limparChaveRecuperacao = (texto) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
