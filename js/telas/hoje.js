/* =========================================================
   Sistema · painel Hoje
   Primeira tela. Junta os avisos de todos os módulos e mostra
   o ritmo do dia: compromissos, prazos, tarefas e hábitos.
   ========================================================= */

import * as avisos from '../nucleo/avisos.js';
import { cabecalho, painel, kpi, icone, toast } from '../nucleo/ui.js';
import { diaPorExtenso, saudacao, esc, isoDia, isoMes, duracao, diaMes } from '../nucleo/util.js';
import * as T from '../modulos/tarefas.js';
import * as H from '../modulos/habitos.js';
import * as K from '../modulos/clientes.js';
import * as M from '../modulos/compromissos.js';
import { linhaCompromisso } from './agenda.js';
import * as dados from '../nucleo/dados.js';

export function desenhar(el) {
  H.criarIniciais();
  avisos.limparObsoletos();
  const hoje = isoDia();
  const lista = avisos.todos();

  const doDia = T.doDia(hoje);
  const atrasadas = T.atrasadas(hoje).filter((t) => t.dia !== hoje);
  const feitas = doDia.filter((t) => t.status === 'feita').length;
  const restante = doDia.filter((t) => t.status === 'aberta').reduce((s, t) => s + (Number(t.tempo) || 0), 0);
  const nome = dados.config('perfil')?.nome;
  const compromissos = M.doDia(hoje);
  const proximo = compromissos.find((c) => c.hora && c.hora >= new Date().toTimeString().slice(0, 5));
  const prazos = K.paraOlhar(hoje);
  const vencemHoje = prazos.filter((p) => K.estadoPrazo(p, hoje).etapa !== 'aviso').length;
  const est = H.estatisticas(isoMes());
  const habitos = est.porHabito;

  const linhaTarefa = (t) => `
    <div class="linha">
      <button class="caixa-chk ${t.status === 'feita' ? 'ok' : ''}" data-feita="${t.id}" aria-label="${t.status === 'feita' ? 'Reabrir' : 'Concluir'}">${t.status === 'feita' ? icone.check(14) : ''}</button>
      <button class="tx" data-editar="${t.id}" style="text-align:left"><b style="${t.status === 'feita' ? 'text-decoration:line-through;color:var(--soft)' : ''}">${t.importante ? '<span class="imp">!</span> ' : ''}${esc(t.titulo)}</b>
        <small><span class="marca-area" style="display:inline-block;background:var(--area-${t.area})"></span> ${T.nomeArea(t.area)} · ${duracao(t.tempo)}${t.dia && t.dia < hoje ? ` · era para ${diaMes(t.dia)}` : ''}</small></button>
      ${t.dia !== hoje ? '<span class="chip neg">atrasada</span>' : ''}
    </div>`;

  const botaoX = (a) => `<button type="button" class="x-aviso" data-dispensar="${esc(a.id)}" aria-label="Tirar este aviso da lista" title="Tirar da lista">×</button>`;
  const textoAviso = (a) => (a.irPara
    ? `<li><button type="button" class="alert ${a.tipo || ''}" data-ir="${a.irPara}"><span class="d"></span><div>${a.texto}</div></button>${botaoX(a)}</li>`
    : `<li><div class="alert ${a.tipo || ''}"><span class="d"></span><div>${a.texto}</div></div>${botaoX(a)}</li>`);
  const nDispensados = avisos.totalDispensados();
  const nH = habitos.length;

  el.innerHTML = `
    ${cabecalho({ sup: diaPorExtenso(), titulo: nome ? `${saudacao()}, ${esc(nome.split(' ')[0])}` : saudacao(), avisos: lista.length, serif: true })}

    <div class="grade g-kpi">
      ${kpi({ rot: 'Compromissos', valor: compromissos.length, sub: proximo ? `o próximo às ${M.horaCurta(proximo.hora)}` : (compromissos.length ? 'nenhum mais por hoje' : 'nada marcado') })}
      ${kpi({ rot: 'Prazos', valor: prazos.length, sub: vencemHoje ? `${vencemHoje} ${vencemHoje === 1 ? 'vence hoje ou venceu' : 'vencem hoje ou venceram'}` : (prazos.length ? 'em aviso' : 'nada urgente') })}
      ${kpi({ rot: 'Tarefas', valor: `${feitas}<span> / ${doDia.length}</span>`, sub: restante ? `${duracao(restante)} ainda previstas` : (doDia.length ? 'tudo feito' : 'nada planejado'), extra: doDia.length ? `<div class="trilho"><i style="width:${(feitas / doDia.length) * 100}%;background:var(--g4)"></i></div>` : '' })}
      ${kpi({ rot: 'Hábitos', valor: `${est.hojeFeitos}<span> / ${nH}</span>`, sub: est.hojeFeitos === nH && nH ? 'todos marcados' : 'toque para marcar abaixo' })}
    </div>

    ${lista.length ? painel({ rot: 'Central', titulo: lista.length === 1 ? '1 aviso' : `${lista.length} avisos`, corpo: `<ul class="alerts com-x">${lista.map(textoAviso).join('')}</ul>${nDispensados ? `<button type="button" class="link-mini" data-restaurar-avisos style="align-self:flex-start">Mostrar de novo ${nDispensados === 1 ? '1 aviso dispensado' : `${nDispensados} avisos dispensados`}</button>` : ''}` })
      : (nDispensados ? painel({ rot: 'Central', titulo: 'Sem avisos', corpo: `<div class="vazio" style="padding:6px 0">Tudo em dia por aqui.</div><button type="button" class="link-mini" data-restaurar-avisos style="align-self:flex-start">Mostrar de novo ${nDispensados === 1 ? '1 aviso dispensado' : `${nDispensados} avisos dispensados`}</button>` }) : '')}

    <div class="grade g-2">
      ${painel({ rot: 'Agenda', titulo: 'Compromissos de hoje', ver: ['#/rotina/agenda', 'Agenda'],
        corpo: compromissos.length ? `<div class="linhas">${compromissos.map(linhaCompromisso).join('')}</div>` : '<div class="vazio">Nenhum compromisso hoje.</div>' })}
      ${painel({ rot: 'Prazos', titulo: 'Para olhar hoje', ver: ['#/clientes/prazos', 'Prazos'],
        corpo: `${prazos.length ? `<div class="linhas">${prazos.map((p) => { const e = K.estadoPrazo(p, hoje); const o = K.origemDoPrazo(p); return `
            <div class="linha">
              <button class="caixa-chk" data-cumprir="${p.id}" aria-label="Marcar como cumprido: ${esc(p.descricao)}"></button>
              <button class="tx" data-prazo="${p.id}" style="text-align:left"><b>${esc(p.descricao)}</b><small>${K.tipoPrazo(p.tipo).nome}${o ? ` · ${esc(o)}` : ''}</small></button>
              <span class="chip ${e.classe}">${e.texto}</span>
            </div>`; }).join('')}</div>` : '<div class="vazio">Nenhum prazo para olhar hoje.</div>'}
          <small style="color:var(--soft)">${K.AVISO_LEGAL}</small>` })}
    </div>

    <div class="grade g-2">
      ${painel({ rot: 'Rotina', titulo: 'Tarefas do dia', ver: ['#/rotina/tarefas', 'Semana'],
        corpo: (doDia.length || atrasadas.length)
          ? `<div class="linhas">${[...atrasadas, ...doDia].map(linhaTarefa).join('')}</div>`
          : '<div class="vazio">Nada planejado para hoje.</div>' })}
      ${painel({ rot: 'Rotina', titulo: 'Hábitos de hoje', ver: ['#/rotina/habitos', 'Tracker'],
        corpo: habitos.length
          ? `<div class="hab-hoje">${habitos.map(({ h, hoje: feito }) => `
              <button data-marcar="${h.id}" aria-pressed="${feito}" style="--c:${H.cor(h)}"><span class="bola">${feito ? icone.check(14) : ''}</span><span>${esc(h.nome)}</span></button>`).join('')}</div>`
          : '<div class="vazio">Nenhum hábito criado.</div>' })}
    </div>`;

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const tarefa = (id) => T.todas().find((t) => t.id === id);
    if (b.dataset.feita) await T.alternarFeita(tarefa(b.dataset.feita));
    else if (b.dataset.editar) T.abrirTarefa(tarefa(b.dataset.editar));
    else if (b.dataset.comp) M.abrirCompromisso(M.todos().find((c) => c.id === b.dataset.comp));
    else if (b.dataset.cumprir) await K.alternarCumprido(K.prazos().find((p) => p.id === b.dataset.cumprir));
    else if (b.dataset.prazo) K.abrirPrazo(K.prazos().find((p) => p.id === b.dataset.prazo));
    else if (b.dataset.dispensar) { await avisos.dispensar(b.dataset.dispensar); toast('Aviso tirado da lista. Ele só volta se a situação deixar de existir e acontecer de novo.'); }
    else if (b.dataset.restaurarAvisos !== undefined) { await avisos.restaurarTodos(); toast('Avisos de volta.'); }
    else if (b.dataset.marcar) await H.alternar(H.lista().find((h) => h.id === b.dataset.marcar), hoje);
  });
}
