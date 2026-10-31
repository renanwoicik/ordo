/* =========================================================
   Sistema · Rotina → Metas do semestre
   Linha do semestre, visão geral (teia) e uma coluna por pilar.
   A lógica fica em js/modulos/metas.js. Esta tela é desenhada
   pela tela Rotina (js/telas/rotina.js).
   ========================================================= */

import * as G from '../nucleo/graficos.js';
import { painel, icone } from '../nucleo/ui.js';
import { esc, isoDia } from '../nucleo/util.js';
import * as M from '../modulos/metas.js';

const estado = { deslocamento: 0 };
const semestreMostrado = () => M.semestreSomar(M.semestreDe(), estado.deslocamento);

export function desenhar() {
  const hoje = isoDia();
  const sem = semestreMostrado();
  const { fracao, semana } = M.andamento(sem, hoje);
  const r = M.resumo(sem);
  const semanasRestantes = semana >= 27 ? 0 : Math.max(0, 26 - semana);
  const total = r.metas.length;

  const linhaMeta = ({ m, p }) => `
    <div class="meta-linha">
      <div class="meta-topo">
        <button type="button" class="tx" data-meta="${m.id}"><b>${esc(m.titulo)}</b></button>
        ${m.tipo === 'manual' ? `<button type="button" class="chip" data-atualizar="${m.id}">atualizar</button>` : '<span class="chip">automática</span>'}
      </div>
      ${G.trilho(p.pct, pilarCor(m))}
      <small>${M.fmtValor(m, p.atual)} de ${M.fmtValor(m, p.alvo)} · ${p.pct}%${p.pct < fracao * 100 - 25 && fracao >= 0.25 && p.pct < 100 ? ' · atrás do ritmo' : ''}</small>
    </div>`;
  const pilarCor = (m) => M.pilar(m.pilar).cor;

  return `
    <div class="nav-mes">
      <div class="nav-semana">
        <button type="button" class="redondo" data-sem="-1" aria-label="Semestre anterior">${icone.voltar(18)}</button>
        <span style="font-weight:500">${sem.nome}</span>
        <button type="button" class="redondo" data-sem="1" aria-label="Próximo semestre">${icone.seta(18)}</button>
        ${estado.deslocamento !== 0 ? '<button type="button" class="link-mini" data-sem="hoje">semestre atual</button>' : ''}
      </div>
      <button type="button" class="btn pri" data-nova-meta>${icone.soma(16)} Meta</button>
    </div>

    ${painel({ rot: semana >= 1 && semana <= 26 ? `Linha do semestre · semana ${semana} de 26` : 'Linha do semestre', titulo: sem.nome,
      corpo: `${G.semestre(semana === 0 ? 0 : semana >= 27 ? 27 : semana)}<div class="meses-semestre">${sem.meses.map((m) => `<span>${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m.slice(5)) - 1]}</span>`).join('')}</div>` })}

    <div class="grade g-2">
      ${painel({ rot: 'Visão geral', titulo: total ? `${total} ${total === 1 ? 'meta' : 'metas'} no semestre` : 'Nenhuma meta ainda',
        corpo: `<div class="radar-bloco" style="justify-content:center">
          ${G.radar(r.porPilar.map((p) => ({ rotulo: p.nome, valor: p.pct ?? 0 })), { tam: 220 })}
          <div><div class="rot">Progresso geral</div><div class="valor g">${r.geral}%</div>
            <small style="color:var(--soft)">${semana >= 27 ? 'semestre encerrado' : semana === 0 ? 'ainda não começou' : `faltam ${semanasRestantes} semanas · passou ${Math.round(fracao * 100)}%`}</small></div>
        </div>` })}
      ${painel({ rot: 'Por pilar', titulo: 'Onde você está',
        corpo: r.porPilar.map((p) => `<div class="pilar-linha"><span style="white-space:nowrap"><span class="dot" style="background:${p.cor}"></span>${p.nome}</span>${G.trilho(p.pct ?? 0, p.cor)}<span style="color:var(--soft);text-align:right">${p.pct === null ? '—' : `${p.pct}%`}</span></div>`).join('') })}
    </div>

    <div class="grade g-3">${r.porPilar.map((p) => `
      <section class="painel" style="gap:12px">
        <div style="display:flex;align-items:center;gap:12px">${G.anel(p.pct ?? 0, { tam: 44, esp: 4, cor: p.cor, texto: p.pct === null ? '' : `${p.pct}` })}
          <div><b style="font:500 15px/1.2 var(--disp);color:var(--titulo);display:inline-flex;align-items:center"><span class="dot" style="background:${p.cor}"></span>${p.nome}</b><br><small style="color:var(--soft)">${p.metas.length} ${p.metas.length === 1 ? 'meta' : 'metas'}</small></div></div>
        ${p.metas.length ? p.metas.map(linhaMeta).join('') : '<div class="vazio" style="padding:6px 0;text-align:left">Nenhuma meta neste pilar ainda.</div>'}
        <button type="button" class="btn sec" data-nova-meta="${p.id}" style="align-self:flex-start">${icone.soma(14)} Meta</button>
      </section>`).join('')}</div>`;
}

export function ligar(el, redesenhar) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    const sem = semestreMostrado();
    const meta = (id) => M.todas().find((m) => m.id === id);
    if (d.sem) { estado.deslocamento = d.sem === 'hoje' ? 0 : estado.deslocamento + Number(d.sem); redesenhar(); }
    else if (d.novaMeta !== undefined) M.abrirMeta(null, { pilarId: d.novaMeta || 'carreira', sem });
    else if (d.meta) M.abrirMeta(meta(d.meta), { sem });
    else if (d.atualizar) M.abrirAtualizar(meta(d.atualizar));
  });
}
