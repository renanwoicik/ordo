/* =========================================================
   Sistema · gráficos
   Gráficos simples desenhados à mão (SVG/HTML), sem nenhuma
   biblioteca de fora. Cada função devolve um texto HTML para
   colocar dentro de um painel.

   Cores: use as variáveis do tema, ex.: 'var(--g2)'.
   ========================================================= */

import { esc } from './util.js';

const soma = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const pct = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);

/** Lista de cores padrão para séries (repete se tiver mais itens). */
export const CORES = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)', 'var(--g6)', 'var(--g7)', 'var(--g8)'];

/**
 * Rosca (como a dos gastos do mês).
 *   rosca([{ rotulo:'Casa', valor:1840, cor:'var(--g2)' }, ...], { centro:'R$ 5,1k', sub:'gastos do mês' })
 */
export function rosca(itens, { tam = 156, esp = 14, centro = '', sub = '', folga = 6 } = {}) {
  const total = soma(itens.map((i) => i.valor));
  const r = (tam - esp) / 2;
  const volta = 2 * Math.PI * r;
  let andado = 0;
  const arcos = itens.map((it, n) => {
    const fatia = total ? (it.valor / total) * volta : 0;
    const visivel = Math.max(0, fatia - folga);
    const arco = `<circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${it.cor || CORES[n % CORES.length]}" stroke-width="${esp}" stroke-linecap="round"
      stroke-dasharray="${visivel} ${volta - visivel}" stroke-dashoffset="${-andado}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>`;
    andado += fatia;
    return arco;
  }).join('');
  return `<div class="rosca" style="width:${tam}px;height:${tam}px">
    <svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="${esc(itens.map((i) => `${i.rotulo} ${pct(i.valor, total)}%`).join(', '))}">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${esp}"/>${arcos}
    </svg>
    <div class="meio"><b>${centro}</b>${sub ? `<small>${sub}</small>` : ''}</div>
  </div>`;
}

/** Legenda com bolinha colorida, nome e % (acompanha a rosca ou a pilha). */
export function legenda(itens, { mostrar = 'pct' } = {}) {
  const total = soma(itens.map((i) => i.valor));
  return `<div class="legenda">${itens.map((it, n) => `
    <div><i style="background:${it.cor || CORES[n % CORES.length]}"></i><span>${esc(it.rotulo)}</span>
    <span class="p">${mostrar === 'pct' ? pct(it.valor, total) + '%' : esc(it.extra ?? '')}</span></div>`).join('')}</div>`;
}

/** Barra empilhada (ex.: quanto fica com você × clínica × aluguel). */
export function pilha(itens) {
  const total = soma(itens.map((i) => i.valor));
  return `<div class="pilha" role="img" aria-label="${esc(itens.map((i) => `${i.rotulo} ${pct(i.valor, total)}%`).join(', '))}">${itens
    .map((it, n) => `<i style="width:${total ? (it.valor / total) * 100 : 0}%;background:${it.cor || CORES[n % CORES.length]}"></i>`).join('')}</div>`;
}

/** Barra de progresso simples. */
export const trilho = (p, cor = 'var(--acc)') =>
  `<div class="trilho" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><i style="width:${Math.max(0, Math.min(100, p))}%;background:${cor}"></i></div>`;

/**
 * Barras verticais (ex.: quanto sobrou por mês). A barra com `on:true` fica destacada.
 *   barras([{ rotulo:'abr', valor:900 }, ..., { rotulo:'set', valor:2060, on:true }])
 */
export function barras(itens, { altura = 120 } = {}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return `<div class="barras" style="height:${altura}px">${itens.map((it) => `
    <div title="${esc(it.dica ?? '')}"><i class="${it.on ? 'on' : ''}" style="height:${Math.max(6, (it.valor / max) * (altura - 22))}px${it.cor ? `;background:${it.cor}` : ''}"></i><span>${esc(it.rotulo)}</span></div>`).join('')}</div>`;
}

/** Anel de progresso pequeno (ex.: 2 de 3 consultas). */
export function anel(p, { tam = 52, esp = 6, cor = 'var(--acc)', texto = '' } = {}) {
  const r = (tam - esp) / 2;
  const volta = 2 * Math.PI * r;
  const cheio = (Math.max(0, Math.min(100, p)) / 100) * volta;
  return `<div class="anel" style="width:${tam}px;height:${tam}px">
    <svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="${esp}"/>
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${cor}" stroke-width="${esp}" stroke-linecap="round"
        stroke-dasharray="${cheio} ${volta}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>
    </svg>
    <div class="meio">${texto}</div>
  </div>`;
}

/**
 * Bolinhas do mês (hábitos). `dias` = lista com true (fez), false (não fez)
 * ou null (dia ainda não chegou). `hoje` = posição de hoje (0 = dia 1).
 */
export function pontos(dias, cor, hoje = -1) {
  return `<div class="pontos">${dias.map((d, i) =>
    `<i class="${d === null ? 'f' : ''} ${i === hoje ? 'hoje' : ''}" style="${d ? `background:${cor}` : ''}"></i>`).join('')}</div>`;
}

/** Linha do semestre: 26 semanas, as passadas coloridas e a atual em destaque. */
export function semestre(atual, total = 26) {
  return `<div class="semestre" aria-label="Semana ${atual} de ${total}">${Array.from({ length: total }, (_, i) =>
    `<i class="${i + 1 < atual ? 'on' : i + 1 === atual ? 'agora' : ''}"></i>`).join('')}</div>`;
}

/**
 * Radar (teia) com valores de 0 a 100 por eixo (ex.: pilares das metas).
 *   radar([{ rotulo:'Carreira', valor:53 }, ...])
 */
export function radar(eixos, { tam = 230, cor = 'var(--g6)' } = {}) {
  const c = tam / 2, r = tam / 2 - 34, n = eixos.length;
  const ponto = (i, raio) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + raio * Math.cos(ang), c + raio * Math.sin(ang)];
  };
  const aneis = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon points="${eixos.map((_, i) => ponto(i, r * f).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`).join('');
  const raios = eixos.map((_, i) => `<line x1="${c}" y1="${c}" x2="${ponto(i, r)[0]}" y2="${ponto(i, r)[1]}" stroke="var(--line)"/>`).join('');
  const forma = eixos.map((e, i) => ponto(i, (r * Math.max(4, e.valor)) / 100).join(',')).join(' ');
  const rotulos = eixos.map((e, i) => {
    const [x, y] = ponto(i, r + 18);
    const ancora = Math.abs(x - c) < 4 ? 'middle' : x < c ? 'end' : 'start';
    return `<text x="${x}" y="${y + 4}" text-anchor="${ancora}" font-size="11" fill="var(--soft)">${esc(e.rotulo)}</text>`;
  }).join('');
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="${esc(eixos.map((e) => `${e.rotulo} ${e.valor}%`).join(', '))}" style="overflow:visible">
    ${aneis}${raios}
    <polygon points="${forma}" fill="${cor}" fill-opacity=".45" stroke="${cor}" stroke-width="2" stroke-linejoin="round"/>
    ${rotulos}
  </svg>`;
}
