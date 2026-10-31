/* =========================================================
   Sistema · sincronização entre aparelhos (Supabase)
   Leva para a nuvem os registros JÁ EMBARALHADOS (do jeito que
   estão no cofre) e traz os dos outros aparelhos. A nuvem nunca
   vê dados legíveis: só pedaços embaralhados e a chave mestra
   trancada pela senha do sistema.

   A chave do config.js é a "publishable" do Supabase: ela é pública
   por desenho e sozinha não abre nada. Quem protege os dados é
   a conta (e-mail e senha da nuvem) mais as regras de linha
   (RLS) do banco: cada conta só enxerga as próprias linhas.

   Regras de combinação:
   - cada registro tem um "upd" (quando mudou); o mais novo vence;
   - apagar também é um registro (del: true), para chegar aos outros;
   - o banco só aceita uma linha se ela for mais nova que a que já existe.

   Estado deste aparelho (localStorage, chave "nuvem"):
     { email, access, refresh, expira, ligada, cursor, empurrado, metaSync, ultima, erro }
   ========================================================= */

import { MARCA } from './marca.js';
import * as cofre from './cofre.js';
import * as dados from './dados.js';
import { pref } from './util.js';

const URL_NUVEM = MARCA.nuvem.url;
const CHAVE_PUBLICA = MARCA.nuvem.chave;
const LOTE = 200;

/* ---------- estado ---------- */

const ler = () => pref.ler('nuvem', null) || {};
const gravar = (mudancas) => { const e = { ...ler(), ...mudancas }; pref.gravar('nuvem', e); return e; };

/** Falso enquanto o config.js não tiver os dados de um projeto Supabase. */
export const configurada = () => !!(URL_NUVEM && CHAVE_PUBLICA);

export const ligada = () => configurada() && ler().ligada === true;
export const estado = () => { const { email, ultima, erro, ligada: l } = ler(); return { ligada: l === true, email, ultima, erro, sincronizando: !!emAndamento }; };

/** Assinatura curta do meta, para saber se ele mudou (senha ou chave de recuperação). */
const assinatura = (m) => [m?.sal, m?.porSenha, m?.salRec, m?.porChaveRec].join('|');

/* ---------- conversa com o Supabase ---------- */

async function chamar(caminho, { metodo = 'GET', corpo, token, cab = {} } = {}) {
  let r;
  try {
    r = await fetch(URL_NUVEM + caminho, {
      method: metodo,
      headers: { apikey: CHAVE_PUBLICA, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cab },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    const e = new Error('Sem conexão com a internet.'); e.offline = true; throw e;
  }
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    const e = new Error(json?.msg || json?.message || json?.error_description || `Erro ${r.status} na nuvem.`);
    e.status = r.status; e.codigo = json?.error_code || json?.code;
    throw e;
  }
  return json;
}

function guardarSessao(s, extra = {}) {
  return gravar({ access: s.access_token, refresh: s.refresh_token, expira: Date.now() + (Number(s.expires_in) || 3600) * 1000, ...extra });
}

/** Entra na conta da nuvem. */
async function entrarNaConta(email, senha) {
  try {
    const s = await chamar('/auth/v1/token?grant_type=password', { metodo: 'POST', corpo: { email, password: senha } });
    guardarSessao(s, { email });
  } catch (e) {
    if (e.status === 400 || e.status === 422) throw new Error('E-mail ou senha da nuvem incorretos.');
    throw e;
  }
}

/** Devolve um token válido (renova se estiver perto de vencer). */
async function token() {
  const e = ler();
  if (!e.refresh) throw Object.assign(new Error('Entre de novo na sincronização.'), { precisaEntrar: true });
  if (e.access && e.expira - Date.now() > 60000) return e.access;
  try {
    const s = await chamar('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', corpo: { refresh_token: e.refresh } });
    return guardarSessao(s).access;
  } catch (err) {
    if (err.offline) throw err;
    throw Object.assign(new Error('Entre de novo na sincronização.'), { precisaEntrar: true });
  }
}

const metaDaNuvem = async (tk) => (await chamar('/rest/v1/cofre_meta?select=meta', { token: tk }))?.[0]?.meta ?? null;
const enviarMeta = (tk, meta) => chamar('/rest/v1/cofre_meta?on_conflict=user_id', {
  metodo: 'POST', token: tk, cab: { Prefer: 'resolution=merge-duplicates,return=minimal' }, corpo: { meta, atualizado: new Date().toISOString() },
});

async function puxar(tk, cursor) {
  const filtro = cursor ? `&srv=gt.${encodeURIComponent(cursor)}` : '';
  return (await chamar(`/rest/v1/cofre_registros?select=id,col,upd,del,dev,iv,ct,srv&order=srv.asc&limit=500${filtro}`, { token: tk })) || [];
}

const empurrarLote = (tk, regs) => chamar('/rest/v1/cofre_registros?on_conflict=user_id,id', {
  metodo: 'POST', token: tk, cab: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  corpo: regs.map((r) => ({ id: r.id, col: r.col, upd: r.upd, del: !!r.del, dev: r.dev ?? null, iv: r.iv ?? null, ct: r.ct ?? null })),
});

const paraLocal = (r) => ({ id: r.id, col: r.col, upd: Number(r.upd), del: !!r.del, dev: r.dev, ...(r.del ? {} : { iv: r.iv, ct: r.ct }) });

/* ---------- uma rodada de sincronização ---------- */

let emAndamento = null;
let aplicandoDaNuvem = false;

/** Sincroniza agora. Nunca lança: o resultado fica em estado(). Devolve { ok, mudou, erro }. */
export function sincronizar() {
  if (!ligada() || !cofre.estaAberto()) return Promise.resolve({ ok: false });
  if (!emAndamento) {
    emAndamento = rodada().finally(() => { emAndamento = null; });
  }
  return emAndamento;
}

async function rodada() {
  try {
    const tk = await token();
    let e = ler();

    // 1. A chave trancada (meta): sobe se a nuvem ainda não tem; troca se a senha mudou em outro aparelho.
    const local = await cofre.metaDoCofre();
    const remoto = await metaDaNuvem(tk);
    if (!remoto) {
      await enviarMeta(tk, local);
      e = gravar({ metaSync: assinatura(local) });
    } else {
      if (remoto.criadoEm !== local.criadoEm) {
        // Cofres diferentes: nunca sobrescrever a nuvem. Só a ligação (adotar) resolve isso.
        throw Object.assign(new Error('Este aparelho tem um cofre diferente do da nuvem. Desligue e ligue a sincronização de novo.'), { cofreDiferente: true });
      }
      if (assinatura(remoto) !== assinatura(local)) {
        if (e.metaSync === assinatura(local)) { await cofre.gravarMetaDoCofre(remoto); e = gravar({ metaSync: assinatura(remoto) }); }
        else { await enviarMeta(tk, local); e = gravar({ metaSync: assinatura(local) }); }
      } else if (e.metaSync !== assinatura(local)) e = gravar({ metaSync: assinatura(local) });
    }

    // 2. Traz o que os outros aparelhos mudaram.
    let cursor = e.cursor || '';
    let mudou = 0;
    for (;;) {
      const lote = await puxar(tk, cursor);
      if (!lote.length) break;
      mudou += await cofre.aplicarBrutos(lote.map(paraLocal));
      cursor = lote.at(-1).srv;
      gravar({ cursor });
      if (lote.length < 500) break;
    }

    // 3. Leva o que mudou neste aparelho.
    const meu = cofre.idDoAparelho();
    // "empurrado" = upd mais novo já enviado; "empurradoIds" = os enviados exatamente nesse instante (dois registros podem ter o mesmo upd).
    const { empurrado: desde = 0, empurradoIds: jaIds = [] } = ler();
    const pendentes = (await cofre.registrosBrutos())
      .filter((r) => r.dev === meu && (r.upd > desde || (r.upd === desde && !jaIds.includes(r.id))))
      .sort((a, b) => a.upd - b.upd);
    for (let i = 0; i < pendentes.length; i += LOTE) {
      const parte = pendentes.slice(i, i + LOTE);
      await empurrarLote(tk, parte);
      const ultimo = parte.at(-1).upd;
      gravar({ empurrado: ultimo, empurradoIds: [...(ultimo === desde ? jaIds : []), ...parte.filter((r) => r.upd === ultimo).map((r) => r.id)] });
    }

    gravar({ ultima: Date.now(), erro: null });
    if (mudou) {
      aplicandoDaNuvem = true;
      try { await dados.carregar(); } finally { aplicandoDaNuvem = false; }
    }
    return { ok: true, mudou };
  } catch (err) {
    console.warn('Sincronização:', err);
    gravar({ erro: err.offline ? 'Sem conexão. Tento de novo quando a internet voltar.' : err.message });
    return { ok: false, erro: err.message };
  }
}

/* ---------- quando sincronizar ---------- */

let pararDeOuvir = null;
let relogio = null;
let adiado = null;

const agendar = () => { clearTimeout(adiado); adiado = setTimeout(sincronizar, 3000); };
const aoVoltar = () => { if (!document.hidden) sincronizar(); };

/** Chamado quando o cofre abre: sincroniza e passa a acompanhar as mudanças. */
export function iniciar() {
  parar();
  if (!ligada()) return;
  sincronizar();
  pararDeOuvir = dados.ouvir(() => { if (!aplicandoDaNuvem) agendar(); });
  relogio = setInterval(sincronizar, 90000);
  document.addEventListener('visibilitychange', aoVoltar);
}

/** Chamado quando o cofre fecha. */
export function parar() {
  pararDeOuvir?.(); pararDeOuvir = null;
  clearInterval(relogio); relogio = null;
  clearTimeout(adiado);
  document.removeEventListener('visibilitychange', aoVoltar);
}

/* ---------- ligar e desligar (usados em Ajustes) ---------- */

/**
 * Entra na conta da nuvem e diz em que situação este aparelho está:
 *   'primeiro' → a nuvem está vazia: este aparelho será o primeiro;
 *   'mesmo'    → a nuvem já guarda o cofre DESTE aparelho;
 *   'outro'    → a nuvem guarda o cofre de outro aparelho: este precisa adotá-lo.
 */
export async function verificar(email, senhaNuvem) {
  await entrarNaConta(email.trim(), senhaNuvem);
  const tk = await token();
  const remoto = await metaDaNuvem(tk);
  const local = await cofre.metaDoCofre();
  const situacao = !remoto ? 'primeiro' : remoto.criadoEm === local.criadoEm ? 'mesmo' : 'outro';
  return { situacao, remoto };
}

/** Primeiro aparelho (ou o mesmo cofre): sobe tudo e liga. */
export async function ligarEsteAparelho() {
  const tk = await token();
  const local = await cofre.metaDoCofre();
  await enviarMeta(tk, local);
  gravar({ ligada: true, cursor: '', empurrado: 0, empurradoIds: [], metaSync: assinatura(local), erro: null });
  const r = await sincronizar();
  if (!r.ok) throw new Error(r.erro || 'Não consegui sincronizar.');
  iniciar();
}

/** Outro aparelho: troca o cofre daqui pelo da nuvem (com a senha do sistema de lá), baixa tudo e liga. */
export async function adotarCofreDaNuvem(remoto, senhaDoSistema) {
  try { await cofre.adotarCofre(remoto, senhaDoSistema); } catch { throw new Error(`Essa senha não abre o cofre da nuvem. Use a senha do ${MARCA.nome} do primeiro aparelho.`); }
  gravar({ ligada: true, cursor: '', empurrado: 0, empurradoIds: [], metaSync: assinatura(remoto), erro: null });
  const r = await sincronizar();
  await dados.carregar();
  if (!r.ok) throw new Error(r.erro || 'Não consegui baixar os dados.');
  iniciar();
}

/** Desliga neste aparelho. Os dados daqui e os da nuvem continuam onde estão. */
export function desligar() {
  parar();
  pref.gravar('nuvem', null);
}

/** Depois de restaurar um backup: baixa tudo de novo e sobe o que for mais novo. */
export function recomecarAcompanhamento() {
  if (ligada()) gravar({ cursor: '', empurrado: 0, empurradoIds: [] });
}
