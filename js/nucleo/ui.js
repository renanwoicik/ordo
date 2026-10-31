/* =========================================================
   Sistema · interface
   Peças de tela reaproveitadas: folha que sobe de baixo,
   aviso curto (toast), confirmação e ícones.
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* ---------- aviso curto ---------- */
let tempoToast = null;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- folha que sobe de baixo ---------- */
let aoFecharFolha = null;
let geracao = 0; // evita que o fechamento de uma folha apague a próxima, aberta logo em seguida

/**
 * Abre a folha com o HTML dado. Devolve o elemento da folha,
 * para a tela ligar os botões dentro dela.
 *   const f = abrirFolha(`<h3>Título</h3>...`, { aoFechar })
 */
export function abrirFolha(html, { aoFechar } = {}) {
  const folha = $('folha');
  const scrim = $('scrim');
  geracao++;
  folha.innerHTML = `<div class="alca" aria-hidden="true"></div>${html}`;
  const titulo = folha.querySelector('h3');
  if (titulo) { titulo.id = 'folha-titulo'; folha.setAttribute('aria-labelledby', 'folha-titulo'); }
  aoFecharFolha = aoFechar || null;
  scrim.hidden = false;
  folha.hidden = false;
  requestAnimationFrame(() => { scrim.classList.add('open'); folha.classList.add('open'); });
  setTimeout(() => folha.querySelector('[autofocus], input, select, textarea, button')?.focus(), 260);
  return folha;
}

export function fecharFolha() {
  const folha = $('folha');
  const scrim = $('scrim');
  if (folha.hidden) return;
  folha.classList.remove('open');
  scrim.classList.remove('open');
  const desta = geracao;
  setTimeout(() => {
    if (desta !== geracao) return; // outra folha já foi aberta: não mexe
    folha.hidden = true; scrim.hidden = true; folha.innerHTML = '';
  }, 250);
  const fn = aoFecharFolha;
  aoFecharFolha = null;
  fn?.();
}

export const folhaAberta = () => !$('folha').hidden;

/** Pergunta "tem certeza?" numa folha. Devolve uma Promise<boolean>. */
export function confirmar({ titulo, texto, ok = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    let respondeu = false;
    const f = abrirFolha(`
      <h3>${titulo}</h3>
      <p class="sub">${texto}</p>
      <div class="acts">
        <button type="button" class="btn sec" data-r="nao">Cancelar</button>
        <button type="button" class="btn ${perigo ? 'perigo' : 'pri'}" data-r="sim">${ok}</button>
      </div>`, { aoFechar: () => { if (!respondeu) resolve(false); } });
    f.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
      respondeu = true;
      resolve(b.dataset.r === 'sim');
      fecharFolha();
    }));
  });
}

/* ---------- montagem de telas ---------- */

/**
 * Troca a área da tela por uma cópia "limpa" (sem os cliques ligados antes).
 * Use antes de redesenhar uma tela que liga eventos, para os cliques não contarem duas vezes.
 */
export function areaLimpa(el) {
  const nova = el.cloneNode(false);
  el.replaceWith(nova);
  return nova;
}

/**
 * Cabeçalho padrão de uma tela, com os botões de avisos e de bloquear.
 *   cabecalho({ sup:'Finanças', titulo:'Dinheiro do mês', voltar:['#/mais','Mais'], avisos:2 })
 *   (serif:true usa a serifada discreta, só na saudação do Hoje)
 */
export function cabecalho({ sup = '', titulo, voltar = null, avisos = 0, serif = false }) {
  return `<header class="top">
    <div>
      ${voltar ? `<a class="voltar" href="${voltar[0]}">${icone.voltar(16)} ${voltar[1]}</a>` : ''}
      ${sup ? `<div class="sup">${sup}</div>` : ''}
      <h1${serif ? ' class="serif"' : ''}>${titulo}</h1>
    </div>
    <div class="acoes">
      <a class="redondo" href="#/hoje" aria-label="Avisos${avisos ? `: ${avisos}` : ''}">${icone.sino(20)}${avisos ? `<span class="cont">${avisos}</span>` : ''}</a>
      <button class="redondo" data-global="bloquear" aria-label="Bloquear">${icone.cadeado(20)}</button>
    </div>
  </header>`;
}

/**
 * Painel (cartão com rótulo, título e conteúdo).
 *   painel({ rot:'Hoje', titulo:'Sua agenda', ver:['#/rotina','Ver tudo'], exemplo:true, corpo:'...' })
 */
export function painel({ rot = '', titulo = '', ver = null, exemplo = false, corpo = '', classe = '' }) {
  return `<section class="painel ${classe}">
    <div class="painel-h">
      <div>
        ${rot || exemplo ? `<div class="rot acc">${rot}${exemplo ? ' <span class="selo">exemplo</span>' : ''}</div>` : ''}
        ${titulo ? `<h2 class="titulo">${titulo}</h2>` : ''}
      </div>
      ${ver ? `<a class="ver" href="${ver[0]}">${ver[1]} ${icone.seta(14)}</a>` : ''}
    </div>
    ${corpo}
  </section>`;
}

/** Abas em pílula que trocam o endereço (#/dinheiro/gastos etc.). */
export const abas = (base, itens, atual) =>
  `<nav class="tabs" role="tablist">${itens.map((p) =>
    `<a class="tab" role="tab" href="#/${base}/${p.rota}" aria-selected="${p.rota === atual}">${p.nome}</a>`).join('')}</nav>`;

/** Número em KPI. */
export const kpi = ({ rot, valor, unidade = '', sub = '', classe = '', extra = '' }) =>
  `<div class="kpi ${classe}"><div class="rot">${rot}</div><div class="v"><b>${valor}</b>${unidade ? `<span>${unidade}</span>` : ''}</div>${extra}${sub ? `<small>${sub}</small>` : ''}</div>`;

/* ---------- ícones (traço fino, herdam a cor do texto) ---------- */
const svg = (d, t = 24) =>
  `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icone = {
  hoje: (t) => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', t),
  dinheiro: (t) => svg('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>', t),
  pessoas: (t) => svg('<circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.8-3.3 3.3-5 6.2-5s5.4 1.7 6.2 5"/><path d="M16 4.8a3.2 3.2 0 0 1 0 6.3M18.2 14.8c1.6.6 2.6 2.1 3 4.7"/>', t),
  rotina: (t) => svg('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m8.5 15 2.2 2.2 4.8-4.7"/>', t),
  mais: (t) => svg('<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>', t),
  seta: (t = 18) => svg('<path d="m9 5 7 7-7 7"/>', t),
  voltar: (t = 18) => svg('<path d="m15 5-7 7 7 7"/>', t),
  conteudo: (t) => svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8" fill="currentColor"/>', t),
  trabalho: (t) => svg('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18"/>', t),
  estudos: (t) => svg('<path d="M2.5 8.5 12 4l9.5 4.5L12 13z"/><path d="M6.5 10.5v4.8c1.4 1.4 3.3 2.2 5.5 2.2s4.1-.8 5.5-2.2v-4.8M21.5 8.5v5.5"/>', t),
  vencimentos: (t) => svg('<path d="M7 3h7l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3z"/><path d="M14 3v5h5M12 11.5v3.5l2.2 1.4"/>', t),
  revisao: (t) => svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5M12 7.5V12l3 2"/>', t),
  ajustes: (t) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>', t),
  cadeado: (t) => svg('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', t),
  chave: (t) => svg('<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 9-9M16.5 6.5l2.5 2.5M14 9l2 2"/>', t),
  nuvem: (t) => svg('<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.6 1.6 3.8 3.8 0 0 1-.5 7.4z"/><path d="M12 16v-5M9.8 13.2 12 11l2.2 2.2"/>', t),
  restaurar: (t) => svg('<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.6 1.6 3.8 3.8 0 0 1-.5 7.4z"/><path d="M12 11v5M9.8 13.8 12 16l2.2-2.2"/>', t),
  lua: (t) => svg('<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>', t),
  celular: (t) => svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>', t),
  lixo: (t) => svg('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>', t),
  atendimento: (t) => svg('<path d="M12 21s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.6C19.5 16.4 12 21 12 21z"/>', t),
  gasto: (t) => svg('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 14.5h4"/>', t),
  tarefa: (t) => svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 2.8 2.8L16.5 9"/>', t),
  ideia: (t) => svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>', t),
  sino: (t) => svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', t),
  soma: (t = 18) => svg('<path d="M12 5v14M5 12h14"/>', t),
  check: (t = 14) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', t),
  relogio: (t) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', t),
  consulta: (t) => svg('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M9 15l2 2 4-4"/>', t),
};
