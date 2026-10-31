/* =========================================================
   Sistema · módulo Clientes, casos e prazos
   Só os clientes próprios, só para gestão: nada de documentos
   nem detalhes do caso. Todos os prazos e datas são digitados à
   mão; o sistema controla e avisa, e não lê nada dos tribunais.

   Cliente (coleção "clientes"):
     { nome, telefone, email, nascimento, origem }
   Caso (coleção "casos"):
     { clienteId, titulo, tipo: 'judicial' | 'extrajudicial' | 'consultivo',
       materia, situacao: 'andamento' | 'aguardando' | 'concluido',
       numero, sistema, inicio }
   Prazo (coleção "prazos"):
     { clienteId, casoId, descricao, data: 'AAAA-MM-DD',
       tipo: 'maior' | 'intermediaria', status: 'aberto' | 'cumprido', cumpridoEm }

   Avisos: o id muda de etapa (em aviso → hoje → vencido). Assim,
   dispensar o aviso de 5 dias não esconde o do dia final.
   Lembretes no calendário NÃO levam nome de cliente: o calendário
   fica fora do cofre.
   ========================================================= */

import * as dados from '../nucleo/dados.js';
import * as avisos from '../nucleo/avisos.js';
import * as lembretes from '../nucleo/lembretes.js';
import { MARCA } from '../nucleo/marca.js';
import { abrirFolha, fecharFolha, toast, confirmar, icone } from '../nucleo/ui.js';
import { esc, isoDia, deIso, somarDias, segundaDaSemana, diasDaSemana, diaMes, NOMES_DIAS } from '../nucleo/util.js';

const COL = 'clientes';
const COL_C = 'casos';
const COL_P = 'prazos';

export const AVISO_LEGAL = 'Os prazos são digitados por você. Não substituem as intimações e os sistemas dos tribunais.';

export const TIPOS_CASO = [['judicial', 'Judicial'], ['extrajudicial', 'Extrajudicial'], ['consultivo', 'Consultivo']];
export const SITUACOES = [['andamento', 'Em andamento'], ['aguardando', 'Aguardando'], ['concluido', 'Concluído']];
export const TIPOS_PRAZO = [
  { id: 'maior', nome: 'Maior', desc: 'contestação, recurso', dias: 5 },
  { id: 'intermediaria', nome: 'Intermediária', desc: 'manifestações', dias: 2 },
];
const MATERIAS = ['Cível', 'Empresarial', 'Imobiliário'];
const SISTEMAS = ['Projudi', 'eproc'];

const nomeDe = (lista, id) => lista.find((x) => x[0] === id)?.[1] ?? id ?? '';
export const nomeTipoCaso = (id) => nomeDe(TIPOS_CASO, id);
export const nomeSituacao = (id) => nomeDe(SITUACOES, id);
export const tipoPrazo = (id) => TIPOS_PRAZO.find((t) => t.id === id) ?? TIPOS_PRAZO[0];
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const dataCurta = (iso) => `${NOMES_DIAS[(deIso(iso).getDay() + 6) % 7]}, ${diaMes(iso)}`;
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const diasAte = (iso, hoje = isoDia()) => Math.round((deIso(iso) - deIso(hoje)) / 86400000);

/** Outros módulos acrescentam à ficha: { html(c), clique(d, trocar, c), apagar(c), texto(c) }. */
const extras = [];
export const registrarExtraFicha = (x) => extras.push(x);

/* =========================================================
   LEITURA E CÁLCULOS
   ========================================================= */

export const todos = () => dados.lista(COL).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
export const pega = (id) => dados.pega(COL, id);
export const casos = () => dados.lista(COL_C);
export const casosDe = (id) => casos().filter((c) => c.clienteId === id)
  .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || '') || (b.criadoEm || 0) - (a.criadoEm || 0));
export const pegaCaso = (id) => dados.pega(COL_C, id);

export const prazos = () => dados.lista(COL_P).sort((a, b) => a.data.localeCompare(b.data));
export const abertos = () => prazos().filter((p) => p.status !== 'cumprido');
export const cumpridos = () => prazos().filter((p) => p.status === 'cumprido').reverse();
export const prazosDe = (id) => prazos().filter((p) => p.clienteId === id);

/** Em que ponto o prazo está. etapa: 'vencido' | 'hoje' | 'aviso' | 'adiante'. */
export function estadoPrazo(p, hoje = isoDia()) {
  const dias = diasAte(p.data, hoje);
  const janela = tipoPrazo(p.tipo).dias;
  if (dias < 0) return { dias, etapa: 'vencido', classe: 'neg', texto: `venceu há ${plural(-dias, 'dia', 'dias')}` };
  if (dias === 0) return { dias, etapa: 'hoje', classe: 'neg', texto: 'vence hoje' };
  if (dias <= janela) return { dias, etapa: 'aviso', classe: 'mid', texto: dias === 1 ? 'vence amanhã' : `em ${dias} dias` };
  return { dias, etapa: 'adiante', classe: '', texto: `em ${dias} dias` };
}

/** Os prazos que precisam de atenção agora: vencidos, de hoje e dentro da janela de aviso. */
export const paraOlhar = (hoje = isoDia()) => abertos().filter((p) => estadoPrazo(p, hoje).etapa !== 'adiante');

/** Nome curto para mostrar num prazo: "cliente · caso". */
export function origemDoPrazo(p) {
  return [pega(p.clienteId)?.nome, pegaCaso(p.casoId)?.titulo].filter(Boolean).join(' · ');
}

/** Histórico de demandas de um cliente, ou de todos. */
export function contagem(lista = casos()) {
  const n = (t) => lista.filter((c) => c.tipo === t).length;
  return { judicial: n('judicial'), extrajudicial: n('extrajudicial'), consultivo: n('consultivo'), concluidos: lista.filter((c) => c.situacao === 'concluido').length, ativos: lista.filter((c) => c.situacao !== 'concluido').length };
}

/** Aniversariantes da semana (segunda a domingo) em que o dia dado cai. */
export function aniversarios(ref = isoDia()) {
  const porDia = new Map(diasDaSemana(segundaDaSemana(ref)).map((d) => [d.slice(5), d]));
  return todos().filter((c) => c.nascimento && porDia.has(c.nascimento.slice(5)))
    .map((c) => ({ c, dia: porDia.get(c.nascimento.slice(5)) }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/* ---------- avisos ---------- */

avisos.registrar('prazos', () => {
  const hoje = isoDia();
  return paraOlhar(hoje).map((p) => {
    const e = estadoPrazo(p, hoje);
    const quem = origemDoPrazo(p);
    const frase = e.etapa === 'vencido' ? `<strong>Prazo vencido</strong> há ${plural(-e.dias, 'dia', 'dias')}`
      : e.etapa === 'hoje' ? '<strong>Prazo final hoje</strong>'
      : `<strong>Prazo</strong> ${e.dias === 1 ? 'amanhã' : `em ${e.dias} dias`}`;
    return {
      id: `prazo-${p.id}-${e.etapa}`, tipo: 'warn', prioridade: e.etapa === 'aviso' ? 8 : 10, irPara: '#/clientes/prazos',
      texto: `${frase}: ${esc(p.descricao)}${quem ? ` (${esc(quem)})` : ''}.`,
    };
  });
});

avisos.registrar('clientes', () => {
  const hoje = isoDia();
  return aniversarios(hoje).map(({ c, dia }) => ({
    id: `cli-aniv-${c.id}-${dia}`, tipo: 'ok', prioridade: dia === hoje ? 5 : 2, irPara: `#/clientes/lista/ficha/${c.id}`,
    texto: `Aniversário de <strong>${esc(c.nome)}</strong> ${dia === hoje ? 'hoje' : `(${dataCurta(dia)})`}.`,
  }));
});

/* =========================================================
   MUDANÇAS NOS DADOS
   ========================================================= */

export async function alternarCumprido(p) {
  const cumprido = p.status !== 'cumprido';
  await dados.salva(COL_P, { ...p, status: cumprido ? 'cumprido' : 'aberto', cumpridoEm: cumprido ? isoDia() : null });
  toast(cumprido ? 'Prazo cumprido ✦' : 'Prazo reaberto.');
}

/* ---------- lembretes no calendário (sem nome de cliente) ---------- */

function eventoDoPrazo(p) {
  const t = tipoPrazo(p.tipo);
  const antes = [...new Set([t.dias, 1, 0])].map((d) => (d === 0 ? 'PT0M' : `-P${d}D`));
  return lembretes.evento({ uid: `${MARCA.id}-prazo-${p.id}@${MARCA.id}`, titulo: `Prazo (${t.nome.toLowerCase()}): abra o ${MARCA.nome}`, inicio: `${p.data}T09:00`, duracao: 30, alarmes: antes });
}

/** Cria os alarmes de todos os prazos abertos de hoje em diante. Devolve quantos. */
export async function enviarParaCalendario(lista = abertos().filter((p) => p.data >= isoDia())) {
  if (!lista.length) return 0;
  await lembretes.entregar(lembretes.calendario(lista.map(eventoDoPrazo)), 'prazos.ics');
  return lista.length;
}

/* ---------- direitos do cliente: exportar e apagar ---------- */

function textoDoCliente(c) {
  const linhas = [`Dados de ${c.nome}`, `Exportado em ${dataBR(isoDia())}`, '', `Telefone: ${c.telefone || '-'}`, `E-mail: ${c.email || '-'}`, `Nascimento: ${dataBR(c.nascimento) || '-'}`, `Origem: ${c.origem || '-'}`, '', 'Casos:'];
  for (const k of casosDe(c.id)) linhas.push(`- ${k.titulo} (${nomeTipoCaso(k.tipo)}, ${k.materia || 'sem matéria'}, ${nomeSituacao(k.situacao)})${k.numero ? ` nº ${k.numero}` : ''}`);
  linhas.push('', 'Prazos:');
  for (const p of prazosDe(c.id)) linhas.push(`- ${dataBR(p.data)}: ${p.descricao} (${p.status === 'cumprido' ? 'cumprido' : 'aberto'})`);
  for (const x of extras) linhas.push(...x.texto(c));
  return linhas.join('\n');
}

async function exportarCliente(c) {
  const arquivo = new File([textoDoCliente(c)], `cliente-${c.nome.split(' ')[0].toLowerCase()}.txt`, { type: 'text/plain' });
  try {
    if (navigator.canShare?.({ files: [arquivo] }) && /iPhone|iPad/.test(navigator.userAgent)) { await navigator.share({ files: [arquivo] }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const url = URL.createObjectURL(arquivo);
  const a = Object.assign(document.createElement('a'), { href: url, download: arquivo.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Arquivo baixado. Ele não vai embaralhado: guarde com cuidado.');
}

async function apagarCliente(c) {
  for (const x of extras) await x.apagar(c);
  for (const p of prazosDe(c.id)) await dados.apaga(COL_P, p.id);
  for (const k of casosDe(c.id)) await dados.apaga(COL_C, k.id);
  await dados.apaga(COL, c.id);
}

/* =========================================================
   FORMULÁRIOS
   ========================================================= */

const reabrir = (id) => id && setTimeout(() => abrirFicha(id), 260);
const opcoes = (id, lista, atual) => `<div class="opcoes" id="${id}">${lista.map(([v, n]) => `<button type="button" data-v="${v}" aria-pressed="${v === atual}">${esc(n)}</button>`).join('')}</div>`;
function unico(f, sel) {
  f.querySelector(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    f.querySelectorAll(`${sel} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    f.querySelector(sel).dispatchEvent(new Event('mudou'));
  });
}
const escolhido = (f, sel) => f.querySelector(`${sel} [aria-pressed="true"]`)?.dataset.v;

export function abrirCliente(c = null) {
  const novo = !c;
  const a = c ? { ...c } : { nome: '', telefone: '', email: '', nascimento: '', origem: '' };
  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} cliente</h3>
    <form id="f-cli" novalidate>
      <div class="fld"><label for="c-nome">Nome</label><input id="c-nome" value="${esc(a.nome)}" autocomplete="off" autofocus></div>
      <div class="par">
        <div class="fld"><label for="c-tel">Telefone ou WhatsApp</label><input id="c-tel" type="tel" inputmode="tel" value="${esc(a.telefone)}" autocomplete="off"></div>
        <div class="fld"><label for="c-nasc">Aniversário</label><input id="c-nasc" type="date" value="${esc(a.nascimento)}"></div>
      </div>
      <div class="fld"><label for="c-email">E-mail</label><input id="c-email" type="email" inputmode="email" value="${esc(a.email)}" autocomplete="off"></div>
      <div class="fld"><label for="c-orig">Origem da indicação</label><input id="c-orig" value="${esc(a.origem)}" placeholder="Ex.: indicação de colega" autocomplete="off"></div>
      <div class="erro" id="c-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  $('[data-fechar]').onclick = () => { fecharFolha(); reabrir(a.id); };
  $('#f-cli').onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = $('#c-nome').value.trim();
    if (!nome) { $('#c-erro').textContent = 'Escreva o nome.'; $('#c-nome').focus(); return; }
    const salvo = await dados.salva(COL, { ...a, nome, telefone: $('#c-tel').value.trim(), email: $('#c-email').value.trim(), nascimento: $('#c-nasc').value, origem: $('#c-orig').value.trim() });
    fecharFolha();
    toast(novo ? 'Cliente cadastrado ✦' : 'Dados salvos.');
    reabrir(salvo.id);
  };
}

const seletorCliente = (atual) => `<select id="sel-cli"><option value="">Sem cliente</option>${todos().map((c) => `<option value="${c.id}" ${c.id === atual ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`;

export function abrirCaso(k = null, { clienteId = '' } = {}) {
  const novo = !k;
  const a = k ? { ...k } : { clienteId, titulo: '', tipo: 'judicial', materia: '', situacao: 'andamento', numero: '', sistema: '', inicio: isoDia() };
  if (!todos().length) { toast('Cadastre um cliente primeiro.'); return; }
  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} caso</h3>
    <form id="f-caso" novalidate>
      <div class="fld"><label for="sel-cli">Cliente</label>${seletorCliente(a.clienteId)}</div>
      <div class="fld"><label for="k-tit">Nome curto do caso</label><input id="k-tit" value="${esc(a.titulo)}" placeholder="Ex.: ação de cobrança" autocomplete="off"></div>
      <div class="fld"><span class="l">Tipo</span>${opcoes('k-tipo', TIPOS_CASO, a.tipo)}</div>
      <div class="fld"><label for="k-mat">Matéria</label><input id="k-mat" list="k-mats" value="${esc(a.materia)}" autocomplete="off"><datalist id="k-mats">${MATERIAS.map((m) => `<option value="${m}">`).join('')}</datalist></div>
      <div class="fld"><span class="l">Situação</span>${opcoes('k-sit', SITUACOES, a.situacao)}</div>
      <div class="par" id="k-jud">
        <div class="fld"><label for="k-num">Número do processo (opcional)</label><input id="k-num" inputmode="numeric" value="${esc(a.numero)}" autocomplete="off"></div>
        <div class="fld"><label for="k-sis">Sistema (opcional)</label><input id="k-sis" list="k-siss" value="${esc(a.sistema)}" autocomplete="off"><datalist id="k-siss">${SISTEMAS.map((m) => `<option value="${m}">`).join('')}</datalist></div>
      </div>
      <div class="fld"><label for="k-ini">Início</label><input id="k-ini" type="date" value="${esc(a.inicio)}"></div>
      <div class="erro" id="k-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-apagar class="perigo">Apagar caso</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  unico(f, '#k-tipo'); unico(f, '#k-sit');
  const ajustar = () => { $('#k-jud').hidden = escolhido(f, '#k-tipo') !== 'judicial'; };
  $('#k-tipo').addEventListener('mudou', ajustar);
  ajustar();
  $('[data-fechar]').onclick = () => { fecharFolha(); reabrir(a.clienteId); };
  $('#f-caso').onsubmit = async (ev) => {
    ev.preventDefault();
    const titulo = $('#k-tit').value.trim();
    const cliente = $('#sel-cli').value;
    const erro = !cliente ? 'Escolha o cliente.' : !titulo ? 'Dê um nome curto ao caso.' : '';
    if (erro) { $('#k-erro').textContent = erro; return; }
    const tipo = escolhido(f, '#k-tipo');
    await dados.salva(COL_C, { ...a, clienteId: cliente, titulo, tipo, materia: $('#k-mat').value.trim(), situacao: escolhido(f, '#k-sit'), numero: tipo === 'judicial' ? $('#k-num').value.trim() : '', sistema: tipo === 'judicial' ? $('#k-sis').value.trim() : '', inicio: $('#k-ini').value });
    fecharFolha();
    toast(novo ? 'Caso cadastrado ✦' : 'Caso salvo.');
    reabrir(cliente);
  };
  $('[data-apagar]')?.addEventListener('click', async () => {
    const ligados = prazos().filter((p) => p.casoId === a.id);
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar caso?', texto: `${esc(a.titulo)}${ligados.length ? ` e ${plural(ligados.length, 'prazo ligado a ele', 'prazos ligados a ele')}` : ''}.`, ok: 'Apagar', perigo: true })) {
      for (const p of ligados) await dados.apaga(COL_P, p.id);
      await dados.apaga(COL_C, a.id);
      toast('Caso apagado.');
    }
    reabrir(a.clienteId);
  });
}

export function abrirPrazo(p = null, { clienteId = '', casoId = '' } = {}) {
  const novo = !p;
  const a = p ? { ...p } : { clienteId, casoId, descricao: '', data: '', tipo: 'maior', status: 'aberto' };
  const opcoesCaso = (cli, atual) => `<option value="">Sem caso</option>${casosDe(cli).map((k) => `<option value="${k.id}" ${k.id === atual ? 'selected' : ''}>${esc(k.titulo)}</option>`).join('')}`;
  const f = abrirFolha(`
    <h3>${novo ? 'Novo' : 'Editar'} prazo</h3>
    <div class="alert mid"><span class="d"></span><div>${AVISO_LEGAL}</div></div>
    <form id="f-prazo" novalidate>
      <div class="fld"><label for="p-desc">O que precisa ser feito</label><input id="p-desc" value="${esc(a.descricao)}" placeholder="Ex.: contestação" autocomplete="off"></div>
      <div class="fld"><label for="p-data">Data final do prazo</label><input id="p-data" type="date" value="${esc(a.data)}"></div>
      <div class="fld"><span class="l">Tipo</span><div class="opcoes" id="p-tipo">${TIPOS_PRAZO.map((t) => `<button type="button" data-v="${t.id}" aria-pressed="${t.id === a.tipo}">${t.nome}</button>`).join('')}</div><small id="p-dica"></small></div>
      <div class="fld"><label for="sel-cli">Cliente</label>${seletorCliente(a.clienteId)}</div>
      <div class="fld"><label for="p-caso">Caso</label><select id="p-caso">${opcoesCaso(a.clienteId, a.casoId)}</select></div>
      <div class="erro" id="p-erro" role="alert"></div>
      ${novo ? '' : '<div class="opcoes acoes-tarefa"><button type="button" data-alarme>Alarme no calendário</button><button type="button" data-apagar class="perigo">Apagar prazo</button></div>'}
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  const $ = (s) => f.querySelector(s);
  unico(f, '#p-tipo');
  const dica = () => { const t = tipoPrazo(escolhido(f, '#p-tipo')); $('#p-dica').textContent = `${t.desc[0].toUpperCase()}${t.desc.slice(1)}: aviso ${t.dias} dias antes.`; };
  $('#p-tipo').addEventListener('mudou', dica);
  dica();
  $('#sel-cli').addEventListener('change', () => { $('#p-caso').innerHTML = opcoesCaso($('#sel-cli').value, ''); });
  $('[data-fechar]').onclick = fecharFolha;
  $('#f-prazo').onsubmit = async (ev) => {
    ev.preventDefault();
    const descricao = $('#p-desc').value.trim();
    const data = $('#p-data').value;
    const erro = !descricao ? 'Escreva o que precisa ser feito.' : !data ? 'Escolha a data final.' : '';
    if (erro) { $('#p-erro').textContent = erro; return; }
    await dados.salva(COL_P, { ...a, descricao, data, tipo: escolhido(f, '#p-tipo'), clienteId: $('#sel-cli').value, casoId: $('#p-caso').value });
    fecharFolha();
    toast(novo ? 'Prazo cadastrado. Crie o alarme no calendário para ser avisado com o app fechado.' : 'Prazo salvo. Se a data mudou, crie o alarme de novo.');
  };
  $('[data-alarme]')?.addEventListener('click', () => { fecharFolha(); enviarParaCalendario([a]); });
  $('[data-apagar]')?.addEventListener('click', async () => {
    fecharFolha();
    if (await confirmar({ titulo: 'Apagar prazo?', texto: esc(a.descricao), ok: 'Apagar', perigo: true })) { await dados.apaga(COL_P, a.id); toast('Prazo apagado. Se havia alarme, apague também no calendário.'); }
  });
}

/* =========================================================
   FICHA
   ========================================================= */

export function abrirFicha(id) {
  const c = pega(id);
  if (!c) return;
  const hoje = isoDia();
  const lista = casosDe(id);
  const n = contagem(lista);
  const materias = [...new Set(lista.map((k) => k.materia).filter(Boolean))];
  const abertosDele = prazosDe(id).filter((p) => p.status !== 'cumprido');
  const digitos = String(c.telefone || '').replace(/\D/g, '');
  const zap = digitos.length >= 10 ? `https://wa.me/${digitos.length <= 11 ? '55' : ''}${digitos}` : '';

  const f = abrirFolha(`
    <div id="ficha">
      <h3>${esc(c.nome)}</h3>
      <div class="chips" style="margin-bottom:14px">
        ${c.origem ? `<span class="chip">veio por ${esc(c.origem)}</span>` : ''}
        ${materias.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}
      </div>
      ${c.telefone || c.email || c.nascimento ? `<p class="sub" style="margin-bottom:12px">${[c.telefone && esc(c.telefone), c.email && esc(c.email), c.nascimento && `aniversário ${dataBR(c.nascimento).slice(0, 5)}`].filter(Boolean).join(' · ')}</p>` : ''}

      <div class="ficha-bloco">
        <div class="rot">Prazos abertos</div>
        ${abertosDele.length ? `<div class="linhas">${abertosDele.map((p) => { const e = estadoPrazo(p, hoje); return `
          <div class="linha"><button type="button" class="tx" data-prazo="${p.id}"><b>${esc(p.descricao)}</b><small>${dataCurta(p.data)}</small></button><span class="chip ${e.classe}">${e.texto}</span></div>`; }).join('')}</div>`
          : '<div class="vazio" style="text-align:left;padding:4px 0">Nenhum prazo aberto.</div>'}
      </div>

      <div class="ficha-bloco">
        <div class="rot">Casos · ${plural(n.judicial, 'judicial', 'judiciais')} · ${plural(n.extrajudicial, 'extrajudicial', 'extrajudiciais')} · ${plural(n.consultivo, 'consultivo', 'consultivos')}</div>
        ${lista.length ? `<div class="linhas">${lista.map((k) => `
          <div class="linha"><button type="button" class="tx" data-caso="${k.id}"><b>${esc(k.titulo)}</b><small>${[nomeTipoCaso(k.tipo), k.materia && esc(k.materia), k.sistema && esc(k.sistema)].filter(Boolean).join(' · ')}</small></button><span class="chip ${k.situacao === 'concluido' ? 'pos' : ''}">${nomeSituacao(k.situacao)}</span></div>`).join('')}</div>`
          : '<div class="vazio" style="text-align:left;padding:4px 0">Nenhum caso cadastrado.</div>'}
      </div>

      ${extras.map((x) => x.html(c)).join('')}

      <div class="opcoes" style="margin:0 0 18px">
        <button type="button" data-acao="caso">${icone.soma(14)} Caso</button>
        <button type="button" data-acao="prazo">${icone.soma(14)} Prazo</button>
        ${zap ? `<a class="botao-link" href="${zap}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button type="button" data-acao="editar">Editar dados</button>
      </div>

      <div class="opcoes acoes-tarefa">
        <button type="button" data-acao="exportar">Exportar dados</button>
        <button type="button" data-acao="apagar" class="perigo">Apagar cliente</button>
      </div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Fechar</button></div>
    </div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#ficha').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    const trocar = (fn) => { fecharFolha(); setTimeout(fn, 260); };
    if (extras.some((x) => x.clique(d, trocar, c))) return;
    if (d.prazo) trocar(() => abrirPrazo(dados.pega(COL_P, d.prazo)));
    else if (d.caso) trocar(() => abrirCaso(pegaCaso(d.caso)));
    else if (d.acao === 'caso') trocar(() => abrirCaso(null, { clienteId: id }));
    else if (d.acao === 'prazo') trocar(() => abrirPrazo(null, { clienteId: id }));
    else if (d.acao === 'editar') trocar(() => abrirCliente(c));
    else if (d.acao === 'exportar') exportarCliente(c);
    else if (d.acao === 'apagar') {
      fecharFolha();
      if (await confirmar({ titulo: 'Apagar cliente?', texto: `${esc(c.nome)}, ${plural(lista.length, 'caso', 'casos')} , ${plural(prazosDe(id).length, 'prazo', 'prazos')} e os honorários dele. Não dá para desfazer, salvo por um backup antigo.`, ok: 'Apagar tudo', perigo: true })) {
        await apagarCliente(c);
        toast('Cliente apagado.');
      }
    }
  });
}
