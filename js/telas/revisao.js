/* =========================================================
   Sistema · Revisão semanal
   Cinco passos, uns 10 minutos. O que você escreve fica na
   memória enquanto navega e só vai para o cofre quando você
   toca em "Concluir revisão". A lógica está em
   js/modulos/revisao.js.
   ========================================================= */

import * as avisos from '../nucleo/avisos.js';
import { cabecalho, painel, kpi, icone, areaLimpa, toast, abrirFolha, fecharFolha } from '../nucleo/ui.js';
import { esc, brl, isoDia, diaMes, dataHora, somarDias, segundaDaSemana, NOMES_DIAS } from '../nucleo/util.js';
import * as R from '../modulos/revisao.js';
import * as T from '../modulos/tarefas.js';
import * as M from '../modulos/metas.js';

const PASSOS = ['Como foi a semana', 'Dinheiro', 'Hábitos e metas', 'Pendências', 'Próxima semana'];
const estado = { segunda: segundaDaSemana(), passo: 0, resp: { certo: '', melhorar: '', prioridades: '' }, carregada: null };
let ultimo = null;

const curto = (v) => (Math.abs(v) >= 1000 ? brl(Math.round(v)).replace(/,00$/, '') : brl(v).replace(/,00$/, ''));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Ao abrir uma semana, traz o que já foi escrito nela (se já houve revisão). */
function carregar() {
  if (estado.carregada === estado.segunda) return;
  const r = R.daSemana(estado.segunda);
  estado.resp = { certo: r?.certo ?? '', melhorar: r?.melhorar ?? '', prioridades: r?.prioridades ?? '' };
  estado.carregada = estado.segunda;
}

export function desenhar(el) {
  el = areaLimpa(el);
  ultimo = { el };
  carregar();
  const hoje = isoDia();
  const d = R.coletar(estado.segunda, hoje);
  const feita = R.daSemana(estado.segunda);
  const ultimoPasso = estado.passo === PASSOS.length - 1;
  const passos = [passo1, passo2, passo3, passo4, passo5];

  el.innerHTML = `
    ${cabecalho({ voltar: ['#/mais', 'Mais'], sup: 'Organização', titulo: 'Revisão semanal', avisos: avisos.todos().length })}
    <div class="nav-mes">
      <div class="nav-semana">
        <button type="button" class="redondo" data-sem="-7" aria-label="Semana anterior">${icone.voltar(18)}</button>
        <span style="font-weight:500">${diaMes(estado.segunda)} a ${diaMes(d.dom)}</span>
        <button type="button" class="redondo" data-sem="7" aria-label="Próxima semana">${icone.seta(18)}</button>
        ${estado.segunda !== segundaDaSemana() ? '<button type="button" class="link-mini" data-sem="hoje">esta semana</button>' : ''}
      </div>
      <div class="chips"><button type="button" class="chip" data-lembrete-dom>Lembrete de domingo</button>
      ${feita ? `<span class="chip pos">${icone.check(12)} concluída em ${dataHora(feita.concluidaEm).split(' às')[0]}</span>` : '<span class="chip">em andamento</span>'}</div>
    </div>

    <div class="passos-rev">${PASSOS.map((n, i) => `<button type="button" class="${i === estado.passo ? 'on' : i < estado.passo ? 'ok' : ''}" data-passo="${i}"><b>${i + 1}</b><span>${n}</span></button>`).join('')}</div>

    ${painel({ rot: `Passo ${estado.passo + 1} de ${PASSOS.length}`, titulo: PASSOS[estado.passo], corpo: passos[estado.passo](d) })}

    <div class="acts">
      ${estado.passo > 0 ? '<button type="button" class="btn sec" data-ir-passo="-1">Voltar</button>' : ''}
      ${ultimoPasso ? `<button type="button" class="btn pri" data-concluir>${icone.check(16)} ${feita ? 'Salvar de novo' : 'Concluir revisão'}</button>` : '<button type="button" class="btn pri" data-ir-passo="1">Próximo passo</button>'}
    </div>

    ${historico()}`;
  ligar(el, d);
}
const redesenhar = () => ultimo && desenhar(ultimo.el);

/* ---------- os cinco passos ---------- */

function passo1(d) {
  return `
    <div class="grade g-kpi" style="margin-bottom:6px">
      ${kpi({ rot: 'Tarefas feitas', valor: d.feitas.length })}
      ${kpi({ rot: 'Atrasadas', valor: d.atrasadas.length, sub: 'tarefas sem concluir' })}
      ${kpi({ rot: 'Hábitos', valor: d.habitos.reduce((s, x) => s + x.feitos, 0), sub: 'marcações na semana' })}
      ${kpi({ rot: 'Avisos', valor: d.pendencias.length, sub: 'pendentes' })}
    </div>
    ${d.feitas.length ? `<div class="rot">Algumas tarefas que você concluiu</div><div class="linhas">${d.feitas.slice(0, 6).map((t) => `<div class="linha"><span class="caixa-chk ok">${icone.check(13)}</span><span class="tx"><b>${esc(t.titulo)}</b><small>${T.nomeArea(t.area)}</small></span></div>`).join('')}</div>` : ''}
    <div class="fld"><label for="r-certo">O que deu certo nesta semana</label><textarea id="r-certo" rows="3" placeholder="Pequenas e grandes vitórias">${esc(estado.resp.certo)}</textarea></div>
    <div class="fld"><label for="r-melhorar">O que não saiu como esperado</label><textarea id="r-melhorar" rows="3" placeholder="O que você mudaria na próxima">${esc(estado.resp.melhorar)}</textarea></div>`;
}

function passo2(d) {
  return `
    <div class="grade g-kpi">
      ${kpi({ rot: 'Entradas da semana', valor: curto(d.entradasTotal), sub: plural(d.entradas.length, 'lançamento', 'lançamentos') })}
      ${kpi({ rot: 'Gastos lançados', valor: curto(d.gastosTotal), sub: plural(d.gastos.length, 'gasto', 'gastos') })}
      ${kpi({ rot: 'Para revisar', valor: d.paraRevisar, sub: 'CPF ou CNPJ?' })}
      ${kpi({ rot: 'Sobra do mês', valor: curto(d.entrouMes - d.saiuMes), sub: `entrou ${curto(d.entrouMes)} · saiu ${curto(d.saiuMes)}` })}
    </div>
    ${d.paraRevisar ? `<div class="alert warn"><span class="d"></span><div>${plural(d.paraRevisar, 'gasto', 'gastos')} para decidir se é CPF ou CNPJ. <a href="#/dinheiro/gastos" style="font-weight:600">Revisar agora</a></div></div>` : ''}
    <small style="color:var(--soft)">Para mexer em algo, abra <a href="#/dinheiro" style="font-weight:600">Dinheiro</a>.</small>`;
}

function passo3(d) {
  return `
    ${d.habitos.length ? `<div class="rot" style="margin-bottom:8px">Hábitos da semana</div><div class="linhas">${d.habitos.map((x) => `
      <div class="linha"><span class="tx"><b>${esc(x.h.nome)}</b><small>${x.feitos} de ${x.meta} ${x.h.freq?.tipo === 'semana' ? 'vezes' : 'dias'}</small></span>
        <span class="mini-pontos">${x.marcas.map((m) => `<i style="${m ? `background:var(--g4)` : ''}"></i>`).join('')}</span></div>`).join('')}</div>` : '<div class="vazio">Nenhum hábito criado.</div>'}
    <div class="rot" style="margin:14px 0 8px">Metas do semestre</div>
    ${d.metasAtras.length ? `<div class="linhas">${d.metasAtras.map(({ m, p: pr }) => `<div class="linha"><span class="tx"><b>${esc(m.titulo)}</b><small>${M.pilar(m.pilar).nome} · ${pr.pct}% feito, atrás do ritmo</small></span><span class="chip neg">${pr.pct}%</span></div>`).join('')}</div>
      <small style="color:var(--soft)">Atualize em <a href="#/rotina/metas" style="font-weight:600">Rotina → Metas</a>.</small>` : '<div class="vazio" style="padding:8px 0;text-align:left">Nenhuma meta atrás do ritmo ✦</div>'}`;
}

function passo4(d) {
  const prox = d.prox;
  const outros = d.pendencias;
  return `
    <div class="rot" style="margin-bottom:6px">Tarefas atrasadas</div>
    ${d.atrasadas.length ? `<div class="linhas">${d.atrasadas.map((t) => `
      <div class="linha"><button type="button" class="tx" data-tarefa="${t.id}"><b>${esc(t.titulo)}</b><small>${T.nomeArea(t.area)}${t.prazo ? ` · prazo ${diaMes(t.prazo)}` : t.dia ? ` · era para ${diaMes(t.dia)}` : ''}</small></button>
        <button type="button" class="chip acc" data-mover="${t.id}">para ${diaMes(prox)}</button></div>`).join('')}</div>` : '<div class="vazio" style="padding:8px 0;text-align:left">Nenhuma tarefa atrasada ✦</div>'}
    ${d.semDia.length ? `<div class="rot" style="margin:14px 0 6px">Tarefas sem dia (${d.semDia.length})</div><div class="linhas">${d.semDia.slice(0, 5).map((t) => `<div class="linha"><button type="button" class="tx" data-tarefa="${t.id}"><b>${esc(t.titulo)}</b><small>${T.nomeArea(t.area)}</small></button></div>`).join('')}</div>${d.semDia.length > 5 ? `<small style="color:var(--soft)">e mais ${d.semDia.length - 5}. Veja em <a href="#/rotina/tarefas" style="font-weight:600">Rotina</a>.</small>` : ''}` : ''}
    <div class="rot" style="margin:14px 0 6px">Avisos de todos os módulos</div>
    ${outros.length ? `<ul class="alerts">${outros.map((a) => `<li>${a.irPara ? `<button type="button" class="alert ${a.tipo || ''}" data-ir="${a.irPara}"><span class="d"></span><div>${a.texto}</div></button>` : `<div class="alert ${a.tipo || ''}"><span class="d"></span><div>${a.texto}</div></div>`}</li>`).join('')}</ul>` : '<div class="vazio" style="padding:8px 0;text-align:left">Nenhum aviso pendente ✦</div>'}`;
}

function passo5(d) {
  const x = d.proxima, pl = x.plano;
  return `
    <div class="grade g-kpi" style="margin-bottom:6px">
      ${kpi({ rot: 'Tarefas com dia', valor: pl.dias.reduce((s, di) => s + di.tarefas.filter((t) => t.status === 'aberta').length, 0), sub: pl.minLivres != null ? (pl.fecha ? 'a semana fecha' : 'a semana não fecha') : 'defina as horas livres' })}
      ${kpi({ rot: 'Prazos na semana', valor: x.prazosProc.length + x.prazos.length + x.vencimentos.length, sub: 'processuais, tarefas e vencimentos' })}
    </div>
    ${x.prazosProc.length || x.prazos.length || x.vencimentos.length ? `<div class="rot" style="margin:8px 0 6px">Prazos e vencimentos</div><div class="linhas">${x.prazosProc.map((p) => `<div class="linha"><span class="tx"><b>${esc(p.descricao)}</b><small>prazo · ${diaMes(p.data)}</small></span></div>`).join('')}${x.prazos.map((t) => `<div class="linha"><span class="tx"><b>${esc(t.titulo)}</b><small>tarefa · prazo ${diaMes(t.prazo)}</small></span></div>`).join('')}${x.vencimentos.map((v) => `<div class="linha"><span class="tx"><b>${esc(v.nome)}</b><small>vencimento · ${diaMes(v.data)}</small></span></div>`).join('')}</div>` : ''}
    <div class="fld" style="margin-top:12px"><label for="r-prior">Minhas 3 prioridades da próxima semana</label><textarea id="r-prior" rows="3" placeholder="1. …&#10;2. …&#10;3. …">${esc(estado.resp.prioridades)}</textarea></div>
    <div class="chips"><a class="btn sec" href="#/rotina/tarefas">${icone.rotina(16)} Planejar na Rotina</a><button type="button" class="btn sec" data-copiar>${icone.ideia(16)} Copiar a semana para o Claude</button></div>`;
}

/* ---------- histórico ---------- */

function historico() {
  const lista = R.todas().slice(0, 8);
  if (!lista.length) return '';
  return painel({ rot: 'Suas revisões', titulo: 'Histórico', corpo: `<div class="linhas">${lista.map((r) => `
    <div class="linha"><button type="button" class="tx" data-rev="${r.id}"><b>Semana de ${diaMes(r.semana)} a ${diaMes(somarDias(r.semana, 6))}</b><small>${esc((r.certo || r.prioridades || 'sem anotações').slice(0, 80))}</small></button></div>`).join('')}</div>` });
}

function abrirRevisaoSalva(r) {
  const f = abrirFolha(`
    <h3>Semana de ${diaMes(r.semana)} a ${diaMes(somarDias(r.semana, 6))}</h3>
    <p class="sub">Concluída em ${dataHora(r.concluidaEm)}</p>
    ${[['O que deu certo', r.certo], ['O que não saiu como esperado', r.melhorar], ['Prioridades da semana seguinte', r.prioridades]].map(([t, v]) => `<div class="rot" style="margin:10px 0 4px">${t}</div><p style="margin:0;white-space:pre-wrap">${esc(v || '—')}</p>`).join('')}
    <div class="acts" style="margin-top:16px"><button type="button" class="btn sec" data-fechar>Fechar</button><button type="button" class="btn pri" data-abrir>Abrir esta semana</button></div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('[data-abrir]').onclick = () => { estado.segunda = r.semana; estado.passo = 0; estado.carregada = null; fecharFolha(); redesenhar(); };
}

/* ---------- cliques ---------- */

function ligar(el, d) {
  el.addEventListener('input', (e) => {
    const alvo = e.target;
    if (alvo.id === 'r-certo') estado.resp.certo = alvo.value;
    else if (alvo.id === 'r-melhorar') estado.resp.melhorar = alvo.value;
    else if (alvo.id === 'r-prior') estado.resp.prioridades = alvo.value;
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = b.dataset;
    if (k.sem) { estado.segunda = k.sem === 'hoje' ? segundaDaSemana() : somarDias(estado.segunda, Number(k.sem)); estado.passo = 0; redesenhar(); }
    else if (k.passo !== undefined) { estado.passo = Number(k.passo); redesenhar(); window.scrollTo(0, 0); }
    else if (k.irPasso) { estado.passo = Math.max(0, Math.min(PASSOS.length - 1, estado.passo + Number(k.irPasso))); redesenhar(); window.scrollTo(0, 0); }
    else if (k.concluir !== undefined) {
      await R.concluir(estado.segunda, estado.resp);
      toast('Revisão concluída ✦ Boa semana!');
    }
    else if (k.mover) { const t = T.todas().find((x) => x.id === k.mover); if (t) { await T.moverPara(t, d.prox); toast(`Tarefa movida para ${diaMes(d.prox)}.`); } }
    else if (k.tarefa) T.abrirTarefa(T.todas().find((x) => x.id === k.tarefa));
    else if (k.lembreteDom !== undefined) R.abrirLembreteDomingo();
    else if (k.rev) abrirRevisaoSalva(R.todas().find((r) => r.id === k.rev));
    else if (k.copiar !== undefined) {
      try { await navigator.clipboard.writeText(T.textoDaSemana(d.prox)); toast('Copiado. Cole no chat com o Claude ✦'); }
      catch { toast('Não consegui copiar. Tente pela tela Rotina.'); }
    }
  });
}
