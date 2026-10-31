/* =========================================================
   Sistema · cofre
   Guarda os dados no próprio aparelho (IndexedDB, um banco de
   dados que existe dentro do navegador), sempre embaralhados.

   Duas "gavetas":
   - meta:      as chaves trancadas (com a senha e com a chave
                de recuperação). Nada legível sem a senha.
   - registros: um item por informação (uma entrada, um
                gasto, uma tarefa...). Cada um embaralhado.

   Formato de cada registro guardado:
     { id, col, upd, del, dev, iv, ct }
     id  → identificador único
     col → coleção (ex.: "entradas") — fica visível para
           permitir filtrar; não revela conteúdo
     upd → quando foi alterado (para a sincronização futura)
     del → true se foi apagado (a sincronização precisa saber)
     dev → qual aparelho alterou
     iv, ct → o conteúdo embaralhado
   ========================================================= */

import { MARCA } from './marca.js';
import * as C from './cripto.js';
import { novoId, pref } from './util.js';

const NOME_BANCO = MARCA.id;
const VERSAO_BANCO = 1;

let banco = null;          // conexão com o IndexedDB
let chaveMestra = null;    // só existe na memória enquanto o cofre está aberto

/* ---------- conexão com o banco ---------- */

function abrirBanco() {
  if (banco) return Promise.resolve(banco);
  return new Promise((ok, falha) => {
    const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('registros')) {
        const r = db.createObjectStore('registros', { keyPath: 'id' });
        r.createIndex('col', 'col');
      }
    };
    req.onsuccess = () => { banco = req.result; ok(banco); };
    req.onerror = () => falha(req.error);
  });
}

/** Executa uma operação numa gaveta e devolve o resultado. */
async function operar(gaveta, modo, fazer) {
  const db = await abrirBanco();
  return new Promise((ok, falha) => {
    const tx = db.transaction(gaveta, modo);
    const loja = tx.objectStore(gaveta);
    let resultado;
    const req = fazer(loja);
    if (req) req.onsuccess = () => { resultado = req.result; };
    tx.oncomplete = () => ok(resultado);
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error);
  });
}

const lerMeta = (k) => operar('meta', 'readonly', (l) => l.get(k));
const gravarMeta = (obj) => operar('meta', 'readwrite', (l) => l.put(obj));

/** Identificador deste aparelho (para saber quem alterou o quê na sincronização). */
export function idDoAparelho() {
  let id = pref.ler('aparelho');
  if (!id) { id = novoId(); pref.gravar('aparelho', id); }
  return id;
}

/* ---------- estado do cofre ---------- */

export async function existe() {
  return !!(await lerMeta('cofre'));
}

export const estaAberto = () => !!chaveMestra;

/** Fecha o cofre: a chave some da memória e os dados ficam ilegíveis até digitar a senha. */
export function fechar() {
  chaveMestra = null;
}

/* ---------- criar, abrir, trocar senha ---------- */

/**
 * Primeiro acesso: sorteia a chave mestra e tranca com a senha e com
 * uma chave de recuperação nova. Devolve a chave de recuperação, que
 * deve ser mostrada UMA vez para a usuária guardar.
 */
export async function criar(senha) {
  const mestra = await C.novaChaveMestra();
  const chaveRec = C.novaChaveRecuperacao();
  const meta = await montarMeta(mestra, senha, chaveRec);
  await gravarMeta({ k: 'cofre', versao: 1, criadoEm: Date.now(), ...meta });
  chaveMestra = mestra;
  return chaveRec;
}

/** Tranca a chave mestra com a senha e com a chave de recuperação. */
async function montarMeta(mestra, senha, chaveRec) {
  const sal = C.aleatorio(16);
  const salRec = C.aleatorio(16);
  const trancaSenha = await C.chaveDaSenha(senha, sal, C.VOLTAS_SENHA);
  const trancaRec = await C.chaveDaSenha(C.limparChaveRecuperacao(chaveRec), salRec, C.VOLTAS_CHAVE_REC);
  return {
    sal: C.paraB64(sal), voltas: C.VOLTAS_SENHA, porSenha: C.paraB64(await C.trancar(mestra, trancaSenha)),
    salRec: C.paraB64(salRec), voltasRec: C.VOLTAS_CHAVE_REC, porChaveRec: C.paraB64(await C.trancar(mestra, trancaRec)),
  };
}

/** Tenta destrancar a chave mestra a partir de um "meta" (do aparelho ou de um backup). */
export async function destrancarMeta(meta, { senha, chaveRec }) {
  if (senha != null) {
    const tranca = await C.chaveDaSenha(senha, C.deB64(meta.sal), meta.voltas);
    return C.destrancar(C.deB64(meta.porSenha), tranca);
  }
  const tranca = await C.chaveDaSenha(C.limparChaveRecuperacao(chaveRec), C.deB64(meta.salRec), meta.voltasRec);
  return C.destrancar(C.deB64(meta.porChaveRec), tranca);
}

/** Abre o cofre com a senha. Devolve true/false. */
export async function abrir(senha) {
  try {
    chaveMestra = await destrancarMeta(await lerMeta('cofre'), { senha });
    return true;
  } catch {
    return false;
  }
}

/** Esqueceu a senha: abre com a chave de recuperação e cadastra uma senha nova. */
export async function recuperar(chaveRec, novaSenha) {
  const meta = await lerMeta('cofre');
  try {
    chaveMestra = await destrancarMeta(meta, { chaveRec });
  } catch {
    return false;
  }
  const sal = C.aleatorio(16);
  const tranca = await C.chaveDaSenha(novaSenha, sal, C.VOLTAS_SENHA);
  await gravarMeta({ ...meta, sal: C.paraB64(sal), voltas: C.VOLTAS_SENHA, porSenha: C.paraB64(await C.trancar(chaveMestra, tranca)) });
  return true;
}

/** Troca a senha (precisa da senha atual). */
export async function trocarSenha(atual, nova) {
  const meta = await lerMeta('cofre');
  let mestra;
  try { mestra = await destrancarMeta(meta, { senha: atual }); } catch { return false; }
  const sal = C.aleatorio(16);
  const tranca = await C.chaveDaSenha(nova, sal, C.VOLTAS_SENHA);
  await gravarMeta({ ...meta, sal: C.paraB64(sal), voltas: C.VOLTAS_SENHA, porSenha: C.paraB64(await C.trancar(mestra, tranca)) });
  return true;
}

/** Gera uma chave de recuperação nova (a antiga deixa de funcionar). Devolve a nova ou null. */
export async function novaChaveRecuperacao(senha) {
  const meta = await lerMeta('cofre');
  let mestra;
  try { mestra = await destrancarMeta(meta, { senha }); } catch { return null; }
  const chaveRec = C.novaChaveRecuperacao();
  const salRec = C.aleatorio(16);
  const tranca = await C.chaveDaSenha(C.limparChaveRecuperacao(chaveRec), salRec, C.VOLTAS_CHAVE_REC);
  await gravarMeta({ ...meta, salRec: C.paraB64(salRec), voltasRec: C.VOLTAS_CHAVE_REC, porChaveRec: C.paraB64(await C.trancar(mestra, tranca)) });
  return chaveRec;
}

/** Confere a senha sem mudar nada (usado antes de ações sensíveis). */
export async function conferirSenha(senha) {
  try { await destrancarMeta(await lerMeta('cofre'), { senha }); return true; } catch { return false; }
}

/* ---------- registros ---------- */

function exigirAberto() {
  if (!chaveMestra) throw new Error('O cofre está fechado.');
}

/** Lê e desembaralha todos os registros. Devolve [{ id, col, upd, del, dados }]. */
export async function lerTodos() {
  exigirAberto();
  const brutos = await operar('registros', 'readonly', (l) => l.getAll());
  const saida = [];
  for (const r of brutos || []) {
    if (r.del) { saida.push({ id: r.id, col: r.col, upd: r.upd, del: true, dados: null }); continue; }
    try {
      saida.push({ id: r.id, col: r.col, upd: r.upd, del: false, dados: await C.decifrar(chaveMestra, r) });
    } catch {
      console.warn('Registro ilegível ignorado:', r.id);
    }
  }
  return saida;
}

/** Embaralha e grava um registro. */
export async function gravar(col, id, dados) {
  exigirAberto();
  const { iv, ct } = await C.cifrar(chaveMestra, dados);
  const reg = { id, col, upd: Date.now(), del: false, dev: idDoAparelho(), iv, ct };
  await operar('registros', 'readwrite', (l) => l.put(reg));
  return reg;
}

/** Marca como apagado (o conteúdo some; fica só o aviso de que existiu, para sincronizar). */
export async function apagar(col, id) {
  exigirAberto();
  const reg = { id, col, upd: Date.now(), del: true, dev: idDoAparelho() };
  await operar('registros', 'readwrite', (l) => l.put(reg));
  return reg;
}

/** Lê o "meta" e os registros como estão guardados (embaralhados) — usado pelo backup. */
export async function exportarBruto() {
  const meta = await lerMeta('cofre');
  const registros = await operar('registros', 'readonly', (l) => l.getAll());
  return { meta, registros: registros || [] };
}

/**
 * Substitui todos os registros deste aparelho pelos de um backup.
 * `itens` vem desembaralhado: [{ id, col, upd, del, dados }]. Aqui é
 * embaralhado de novo com a chave mestra DESTE aparelho.
 */
export async function substituirTudo(itens) {
  exigirAberto();
  const novos = [];
  for (const it of itens) {
    if (it.del) { novos.push({ id: it.id, col: it.col, upd: it.upd, del: true, dev: idDoAparelho() }); continue; }
    const { iv, ct } = await C.cifrar(chaveMestra, it.dados);
    novos.push({ id: it.id, col: it.col, upd: it.upd, del: false, dev: idDoAparelho(), iv, ct });
  }
  await operar('registros', 'readwrite', (l) => {
    l.clear();
    for (const r of novos) l.put(r);
  });
}

/* ---------- para a sincronização (js/nucleo/sincronia.js) ---------- */

/** O "meta" do cofre (a chave mestra trancada). Vai para a nuvem; sem a senha ele não abre nada. */
export const metaDoCofre = () => lerMeta('cofre');

/** Troca só o meta (senha ou chave de recuperação mudaram em outro aparelho). A chave mestra é a mesma. */
export const gravarMetaDoCofre = (meta) => gravarMeta({ ...meta, k: 'cofre' });

/** Todos os registros como estão guardados (embaralhados). */
export async function registrosBrutos() {
  return (await operar('registros', 'readonly', (l) => l.getAll())) || [];
}

/** Grava registros vindos da nuvem, só se forem mais novos que os daqui. Devolve quantos mudaram. */
export async function aplicarBrutos(regs) {
  if (!regs.length) return 0;
  const locais = new Map((await registrosBrutos()).map((r) => [r.id, r.upd]));
  const novos = regs.filter((r) => !locais.has(r.id) || r.upd > locais.get(r.id));
  if (!novos.length) return 0;
  await operar('registros', 'readwrite', (l) => { for (const r of novos) l.put(r); });
  return novos.length;
}

/**
 * Este aparelho passa a usar o cofre da nuvem: abre o meta de lá com a senha dele,
 * troca o meta daqui e esvazia os registros (eles chegam da nuvem em seguida).
 * Lança erro se a senha não abrir.
 */
export async function adotarCofre(meta, senha) {
  const mestra = await destrancarMeta(meta, { senha });
  await gravarMeta({ ...meta, k: 'cofre' });
  await operar('registros', 'readwrite', (l) => { l.clear(); });
  chaveMestra = mestra;
}

/** Apaga TUDO deste aparelho (cofre e registros). Não tem volta. */
export async function apagarAparelho() {
  pref.gravar('nuvem', null);
  chaveMestra = null;
  if (banco) { banco.close(); banco = null; }
  await new Promise((ok, falha) => {
    const req = indexedDB.deleteDatabase(NOME_BANCO);
    req.onsuccess = ok;
    req.onerror = () => falha(req.error);
    req.onblocked = ok;
  });
}
