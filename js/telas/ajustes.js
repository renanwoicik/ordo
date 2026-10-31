/* =========================================================
   Sistema · Ajustes e backup
   Aparência, segurança (senha, bloqueio, chave de
   recuperação), backup/restauração e instalação no iPhone.
   ========================================================= */

import { MARCA } from '../nucleo/marca.js';
import * as cofre from '../nucleo/cofre.js';
import * as dados from '../nucleo/dados.js';
import * as backup from '../nucleo/backup.js';
import * as nuvem from '../nucleo/sincronia.js';
import * as V from '../modulos/vencimentos.js';
import * as R from '../modulos/revisao.js';
import * as H from '../modulos/habitos.js';
import { abrirFolha, fecharFolha, confirmar, toast, icone, cabecalho } from '../nucleo/ui.js';
import { pref, dataHora, diasDesde, esc } from '../nucleo/util.js';
import { htmlChave, ligarBotoesChave } from './bloqueio.js';

const TEMAS = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];
const BLOQUEIO = [[1, '1 minuto'], [5, '5 minutos'], [15, '15 minutos'], [60, '1 hora'], [0, 'Nunca']];

export function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.dataset.theme = 'light';
  else if (tema === 'escuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
}

const item = (acao, ic, titulo, desc, extra = icone.seta(), cls = '') => `
  <button class="item ${cls}" data-acao="${acao}">
    <span class="ic">${ic(20)}</span>
    <span class="tx"><b>${titulo}</b>${desc ? `<small>${desc}</small>` : ''}</span>
    <span class="seta">${extra}</span>
  </button>`;

export function desenhar(el) {
  const tema = pref.ler('tema', 'auto');
  const minutos = pref.ler('bloqueioMin', 5);
  const ultimo = backup.ultimo();
  const textoBackup = ultimo ? `Último: ${dataHora(ultimo)}${diasDesde(ultimo) >= 7 ? ' · já passou de 7 dias' : ''}` : 'Você ainda não fez nenhum backup';
  const total = Object.entries(dados.contagem()).filter(([c]) => c !== 'config').reduce((s, [, n]) => s + n, 0);

  const nv = nuvem.estado();
  const textoNuvem = nv.erro ? nv.erro : nv.ultima ? `Sincronizado em ${dataHora(nv.ultima)}` : 'Ainda não sincronizou';

  el.innerHTML = `
    ${cabecalho({ voltar: ['#/mais', 'Mais'], titulo: 'Ajustes <em>e backup</em>' })}

    <section>
      <h2>Seu perfil</h2>
      <div class="lista">
        ${item('perfil', icone.pessoas, esc(dados.config('perfil')?.nome || 'Seu nome'), esc(dados.config('perfil')?.profissao || 'Aparece na saudação e no menu. Fica só no seu cofre.'))}
      </div>
    </section>

    <section>
      <h2>Aparência</h2>
      <div class="card">
        <div class="fld" style="margin:0"><span class="l" id="l-tema">Modo de cor</span>
          <div class="seg" role="group" aria-labelledby="l-tema">${TEMAS.map(([v, n]) =>
            `<button type="button" data-tema="${v}" aria-pressed="${tema === v}">${n}</button>`).join('')}</div>
          <small>“Automático” segue o modo claro/escuro do seu iPhone ou Mac.</small>
        </div>
      </div>
    </section>

    <section>
      <h2>Backup</h2>
      <div class="lista">
        ${item('backup', icone.nuvem, 'Fazer backup agora', esc(textoBackup))}
        ${item('restaurar', icone.restaurar, 'Restaurar um backup', 'Substitui os dados deste aparelho')}
      </div>
      <input type="file" id="arquivo-backup" accept=".cofre,application/json" hidden>
    </section>

    <section>
      <h2>Sincronização</h2>
      <div class="lista">
        ${nv.ligada
          ? `${item('nuvem-agora', icone.nuvem, 'Sincronizar agora', `${esc(textoNuvem)} · ${esc(nv.email || '')}`)}
             ${item('nuvem-desligar', icone.celular, 'Desligar neste aparelho', 'Os dados daqui e os da nuvem continuam onde estão')}`
          : nuvem.configurada()
            ? item('nuvem-ligar', icone.nuvem, 'Ligar a sincronização', 'Mac e iPhone com os mesmos dados, embaralhados na nuvem')
            : '<div class="vazio" style="text-align:left">Ainda não configurada neste sistema (falta o projeto Supabase no config.js).</div>'}
      </div>
    </section>

    <section>
      <h2>Lembretes no iPhone</h2>
      <div class="lista">
        ${item('lembrete-venc', icone.vencimentos, 'Vencimentos', 'Avisa antes de cada vencimento, na véspera e no dia')}
        ${item('lembrete-dom', icone.revisao, 'Revisão de domingo', 'Todo domingo, no horário que você escolher')}
        ${item('lembrete-hab', icone.rotina, 'Hábitos', 'Os hábitos que têm horário de lembrete')}
      </div>
      <p class="sub" style="margin:8px 4px 0;font-size:12.5px">Os lembretes entram no app Calendário do iPhone, que avisa sozinho mesmo com o ${MARCA.nome} fechado. Nada sai do seu aparelho. Adicionar de novo atualiza, não duplica.</p>
    </section>

    <section>
      <h2>Segurança</h2>
      <div class="lista">
        ${item('bloquear', icone.cadeado, 'Bloquear agora', 'Pede a senha de novo')}
        <label class="item" for="sel-bloqueio">
          <span class="ic">${icone.cadeado(20)}</span>
          <span class="tx"><b>Bloquear sozinho</b><small>Depois de sair do app por</small></span>
          <select id="sel-bloqueio" style="border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:8px;font-size:15px">
            ${BLOQUEIO.map(([v, n]) => `<option value="${v}" ${v === minutos ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        ${item('senha', icone.chave, 'Trocar senha', '')}
        ${item('chave', icone.chave, 'Nova chave de recuperação', 'A chave antiga deixa de funcionar')}
      </div>
    </section>

    <section>
      <h2>Aparelhos</h2>
      <div class="lista">
        ${item('instalar', icone.celular, 'Instalar no iPhone', 'Ícone na tela de início, funciona sem internet')}
        ${item('sobre', icone.cadeado, 'Onde ficam os meus dados', `${total} ${total === 1 ? 'item guardado' : 'itens guardados'} neste aparelho`)}
      </div>
    </section>

    <section>
      <h2>Zona de cuidado</h2>
      <div class="lista">
        ${item('apagar', icone.lixo, 'Apagar os dados deste aparelho', 'Não tem volta. Faça um backup antes.', icone.seta(), 'perigo')}
      </div>
    </section>`;

  /* aparência */
  el.querySelectorAll('[data-tema]').forEach((b) => b.addEventListener('click', () => {
    pref.gravar('tema', b.dataset.tema);
    aplicarTema(b.dataset.tema);
    desenhar(el);
  }));

  /* bloqueio automático */
  el.querySelector('#sel-bloqueio').addEventListener('change', (e) => {
    pref.gravar('bloqueioMin', Number(e.target.value));
    toast('Pronto, ajuste salvo.');
  });

  /* arquivo de restauração */
  el.querySelector('#arquivo-backup').addEventListener('change', async (e) => {
    const arq = e.target.files[0];
    e.target.value = '';
    if (arq) folhaRestaurar(arq, el);
  });

  /* botões da lista */
  el.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
    const acao = b.dataset.acao;
    if (acao === 'perfil') folhaPerfil();
    else if (acao === 'backup') fazerBackup(el);
    else if (acao === 'restaurar') el.querySelector('#arquivo-backup').click();
    else if (acao === 'nuvem-ligar') folhaLigarNuvem(el);
    else if (acao === 'nuvem-agora') sincronizarAgora(el);
    else if (acao === 'nuvem-desligar') desligarNuvem(el);
    else if (acao === 'lembrete-venc') { if (!(await V.enviarParaCalendario())) toast('Cadastre um vencimento primeiro.'); }
    else if (acao === 'lembrete-dom') R.abrirLembreteDomingo();
    else if (acao === 'lembrete-hab') { if (!(await H.baixarLembretesDeTodos())) toast('Nenhum hábito tem horário de lembrete. Defina no próprio hábito.'); }
    else if (acao === 'bloquear') window.dispatchEvent(new Event('app:bloquear'));
    else if (acao === 'senha') folhaTrocarSenha();
    else if (acao === 'chave') folhaNovaChave();
    else if (acao === 'instalar') folhaInstalar();
    else if (acao === 'sobre') folhaSobre();
    else if (acao === 'apagar') folhaApagar();
  }));
}

/* ---------- backup ---------- */

async function fazerBackup(el) {
  try {
    if (await backup.fazer()) {
      toast('Backup gerado. Guarde o arquivo no iCloud Drive.');
      desenhar(el);
    }
  } catch (e) {
    console.error(e);
    toast('Não consegui gerar o backup.');
  }
}

async function folhaRestaurar(arquivo, el) {
  let conteudo;
  try { conteudo = await backup.lerArquivo(arquivo); } catch (e) { toast(e.message); return; }
  const f = abrirFolha(`
    <h3>Restaurar backup</h3>
    <p class="sub">Backup de <b>${dataHora(conteudo.criadoEm)}</b>. Os dados atuais deste aparelho serão <b>substituídos</b> pelos do backup.</p>
    <form id="f-rest" novalidate>
      <div class="fld"><label for="r-senha">Senha que você usava quando fez esse backup</label>
        <input id="r-senha" type="password" autocomplete="off">
        <small>Se não lembrar, use a chave de recuperação daquela época no lugar da senha.</small></div>
      <div class="erro" id="r-erro" role="alert"></div>
      <div class="acts">
        <button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button type="submit" class="btn pri">Restaurar</button>
      </div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-rest').onsubmit = async (ev) => {
    ev.preventDefault();
    const valor = f.querySelector('#r-senha').value;
    const botao = f.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Restaurando…';
    try {
      // Tenta como senha; se não der, tenta como chave de recuperação.
      let n;
      try { n = await backup.restaurar(conteudo, { senha: valor }); }
      catch { n = await backup.restaurar(conteudo, { chaveRec: valor }); }
      fecharFolha();
      toast(`Backup restaurado: ${n} ${n === 1 ? 'item' : 'itens'}.`);
      desenhar(el);
    } catch (e) {
      botao.disabled = false; botao.textContent = 'Restaurar';
      f.querySelector('#r-erro').textContent = e.message;
    }
  };
}

/* ---------- senha e chave ---------- */

function folhaTrocarSenha() {
  const f = abrirFolha(`
    <h3>Trocar senha</h3>
    <form id="f-senha" novalidate>
      <div class="fld"><label for="t-atual">Senha atual</label><input id="t-atual" type="password" autocomplete="current-password"></div>
      <div class="fld"><label for="t-nova">Senha nova</label><input id="t-nova" type="password" autocomplete="new-password"><small>Pelo menos 8 caracteres.</small></div>
      <div class="fld"><label for="t-nova2">Repita a senha nova</label><input id="t-nova2" type="password" autocomplete="new-password"></div>
      <div class="erro" id="t-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Trocar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-senha').onsubmit = async (ev) => {
    ev.preventDefault();
    const erro = f.querySelector('#t-erro');
    const atual = f.querySelector('#t-atual').value, nova = f.querySelector('#t-nova').value, nova2 = f.querySelector('#t-nova2').value;
    if (nova.length < 8) { erro.textContent = 'A senha nova precisa ter pelo menos 8 caracteres.'; return; }
    if (nova !== nova2) { erro.textContent = 'As duas senhas novas não estão iguais.'; return; }
    if (!(await cofre.trocarSenha(atual, nova))) { erro.textContent = 'A senha atual está incorreta.'; return; }
    fecharFolha();
    toast('Senha trocada. Backups antigos continuam abrindo com a senha antiga.');
  };
}

function folhaNovaChave() {
  const f = abrirFolha(`
    <h3>Nova chave de recuperação</h3>
    <p class="sub">A chave antiga deixa de abrir este aparelho. Backups antigos continuam abrindo com a chave antiga.</p>
    <form id="f-chave" novalidate>
      <div class="fld"><label for="k-senha">Confirme com a sua senha</label><input id="k-senha" type="password" autocomplete="current-password"></div>
      <div class="erro" id="k-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Gerar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-chave').onsubmit = async (ev) => {
    ev.preventDefault();
    const chave = await cofre.novaChaveRecuperacao(f.querySelector('#k-senha').value);
    if (!chave) { f.querySelector('#k-erro').textContent = 'Senha incorreta.'; return; }
    const g = abrirFolha(`
      <h3>Sua nova chave</h3>
      <p class="sub">Guarde no app Senhas do iPhone e num papel. Ela aparece só agora.</p>
      ${htmlChave(chave)}
      <div class="acts" style="margin-top:10px"><button type="button" class="btn pri" data-fechar>Guardei</button></div>`);
    ligarBotoesChave(chave, toast);
    g.querySelector('[data-fechar]').onclick = fecharFolha;
  };
}

/* ---------- perfil ---------- */

function folhaPerfil() {
  const p = dados.config('perfil') ?? {};
  const f = abrirFolha(`
    <h3>Seu perfil</h3>
    <form id="f-perfil" novalidate>
      <div class="fld"><label for="p-nome">Nome</label><input id="p-nome" value="${esc(p.nome || '')}" autocomplete="off" autofocus></div>
      <div class="fld"><label for="p-prof">Profissão (opcional)</label><input id="p-prof" value="${esc(p.profissao || '')}" autocomplete="off"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Salvar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-perfil').onsubmit = async (ev) => {
    ev.preventDefault();
    await dados.salvaConfig('perfil', { nome: f.querySelector('#p-nome').value.trim(), profissao: f.querySelector('#p-prof').value.trim() });
    fecharFolha();
    toast('Perfil salvo ✦');
  };
}

/* ---------- informações ---------- */

function folhaInstalar() {
  const f = abrirFolha(`
    <h3>Instalar no iPhone</h3>
    <div class="texto">
      <p>1. Abra o endereço do ${MARCA.nome} no <b>Safari</b> do iPhone.</p>
      <p>2. Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima).</p>
      <p>3. Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</p>
      <p>Pronto: o ${MARCA.nome} aparece como um app, abre em tela cheia e funciona sem internet.</p>
      <p style="color:var(--soft);font-size:13.5px">Importante: o app instalado guarda os dados separados do Safari. Use sempre o ícone da tela de início.</p>
    </div>
    <div class="acts"><button type="button" class="btn pri" data-fechar>Entendi</button></div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
}

function folhaSobre() {
  const cont = dados.contagem();
  const linhas = Object.entries(cont).map(([c, n]) => `<li>${esc(c)}: ${n}</li>`).join('') || '<li>Nenhum item guardado ainda.</li>';
  const f = abrirFolha(`
    <h3>Onde ficam os meus dados</h3>
    <div class="texto">
      <p><b>Neste aparelho</b>, dentro do navegador, embaralhados com a sua senha. Sem a senha ou a chave de recuperação, ninguém lê.</p>
      <p>${nuvem.ligada() ? '<b>A sincronização está ligada:</b> os dados vão para a nuvem (Supabase, em São Paulo) <b>já embaralhados</b>. A nuvem não consegue ler nada.' : '<b>Nada é enviado para a internet.</b> Se você ligar a sincronização, os dados vão para a nuvem já embaralhados.'}</p>
      <p><b>Backup:</b> o arquivo .cofre também vai embaralhado. Guarde no iCloud Drive.</p>
      <p>O que está guardado agora:</p>
      <ul>${linhas}</ul>
    </div>
    <div class="acts"><button type="button" class="btn pri" data-fechar>Fechar</button></div>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
}

/* ---------- apagar ---------- */

function folhaApagar() {
  const f = abrirFolha(`
    <h3>Apagar os dados deste aparelho</h3>
    <p class="sub">Isso apaga a senha e <b>todos</b> os dados guardados neste aparelho. Só dá para recuperar com um arquivo de backup.</p>
    <form id="f-apagar" novalidate>
      <div class="fld"><label for="a-conf">Para confirmar, escreva APAGAR</label><input id="a-conf" type="text" autocomplete="off" autocapitalize="characters"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn perigo">Apagar tudo</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = fecharFolha;
  f.querySelector('#f-apagar').onsubmit = async (ev) => {
    ev.preventDefault();
    if (f.querySelector('#a-conf').value.trim().toUpperCase() !== 'APAGAR') { toast('Escreva APAGAR para confirmar.'); return; }
    fecharFolha();
    if (!(await confirmar({ titulo: 'Última confirmação', texto: 'Apagar tudo deste aparelho agora?', ok: 'Apagar', perigo: true }))) return;
    await cofre.apagarAparelho();
    pref.gravar('ultimoBackup', null);
    location.reload();
  };
}

/* ---------- sincronização ---------- */

async function sincronizarAgora(el) {
  toast('Sincronizando…');
  const r = await nuvem.sincronizar();
  toast(r.ok ? (r.mudou ? 'Pronto: chegaram dados novos ✦' : 'Tudo em dia ✦') : (nuvem.estado().erro || 'Não consegui sincronizar.'));
  desenhar(el);
}

async function desligarNuvem(el) {
  if (!(await confirmar({ titulo: 'Desligar a sincronização?', texto: 'Este aparelho para de enviar e receber. Os dados daqui e os que já estão na nuvem continuam onde estão.', ok: 'Desligar', perigo: true }))) return;
  nuvem.desligar();
  toast('Sincronização desligada neste aparelho.');
  desenhar(el);
}

function folhaLigarNuvem(el) {
  const f = abrirFolha(`
    <h3>Ligar a <em>sincronização</em></h3>
    <p class="sub">Entre com o e-mail e a senha da <b>conta da nuvem</b> (a que você criou no Supabase). Ela é diferente da senha do ${MARCA.nome}.</p>
    <form id="f-nuvem" novalidate>
      <div class="fld"><label for="n-email">E-mail da nuvem</label><input id="n-email" type="email" autocomplete="username" autocapitalize="none" autofocus></div>
      <div class="fld"><label for="n-senha">Senha da nuvem</label><input id="n-senha" type="password" autocomplete="current-password"></div>
      <div class="erro" id="n-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Continuar</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = () => { nuvem.desligar(); fecharFolha(); };
  f.querySelector('#f-nuvem').onsubmit = async (ev) => {
    ev.preventDefault();
    const botao = f.querySelector('button[type=submit]');
    const erro = f.querySelector('#n-erro');
    const email = f.querySelector('#n-email').value, senha = f.querySelector('#n-senha').value;
    if (!email || !senha) { erro.textContent = 'Preencha o e-mail e a senha da nuvem.'; return; }
    botao.disabled = true; botao.textContent = 'Entrando…'; erro.textContent = '';
    try {
      const { situacao, remoto } = await nuvem.verificar(email, senha);
      if (situacao === 'outro') folhaAdotar(remoto, el); else folhaPrimeiro(situacao, el);
    } catch (e) {
      botao.disabled = false; botao.textContent = 'Continuar';
      erro.textContent = e.message;
    }
  };
}

function folhaPrimeiro(situacao, el) {
  const total = Object.entries(dados.contagem()).filter(([c]) => c !== 'config').reduce((s, [, n]) => s + n, 0);
  const f = abrirFolha(`
    <h3>${situacao === 'mesmo' ? 'Reconectar' : 'Este será o primeiro aparelho'}</h3>
    <p class="sub">${situacao === 'mesmo'
      ? 'A nuvem já guarda o cofre deste aparelho. Vou só reconectar e conferir as diferenças.'
      : `A nuvem está vazia. Vou enviar os <b>${total} ${total === 1 ? 'item' : 'itens'}</b> deste aparelho, <b>já embaralhados</b>. Depois, nos outros aparelhos, você entra com a mesma conta e a senha do ${MARCA.nome} daqui.`}</p>
    <div class="erro" id="p-erro" role="alert"></div>
    <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="button" class="btn pri" data-ligar>Ligar</button></div>`);
  f.querySelector('[data-fechar]').onclick = () => { nuvem.desligar(); fecharFolha(); };
  f.querySelector('[data-ligar]').onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Enviando…';
    try {
      await nuvem.ligarEsteAparelho();
      fecharFolha();
      toast('Sincronização ligada ✦');
      desenhar(el);
    } catch (e) {
      ev.target.disabled = false; ev.target.textContent = 'Ligar';
      f.querySelector('#p-erro').textContent = e.message;
    }
  };
}

function folhaAdotar(remoto, el) {
  const total = Object.entries(dados.contagem()).filter(([c]) => c !== 'config').reduce((s, [, n]) => s + n, 0);
  const f = abrirFolha(`
    <h3>Trazer os dados da <em>nuvem</em></h3>
    <p class="sub">A nuvem já guarda os dados de outro aparelho. Para usar o mesmo cofre, este aparelho vai <b>trocar o que tem aqui${total ? ` (${total} ${total === 1 ? 'item' : 'itens'})` : ''} pelo que está na nuvem</b>.</p>
    ${total ? '<div class="opcoes acoes-tarefa"><button type="button" data-backup>Fazer backup do que há aqui antes</button></div>' : ''}
    <form id="f-adotar" novalidate>
      <div class="fld"><label for="d-senha">Senha do ${MARCA.nome} do primeiro aparelho</label>
        <input id="d-senha" type="password" autocomplete="off" autofocus>
        <small>Depois disso, esta passa a ser também a senha do ${MARCA.nome} neste aparelho.</small></div>
      <div class="erro" id="d-erro" role="alert"></div>
      <div class="acts"><button type="button" class="btn sec" data-fechar>Cancelar</button><button type="submit" class="btn pri">Trazer os dados</button></div>
    </form>`);
  f.querySelector('[data-fechar]').onclick = () => { nuvem.desligar(); fecharFolha(); };
  f.querySelector('[data-backup]')?.addEventListener('click', async () => {
    try { if (await backup.fazer()) toast('Backup gerado.'); } catch { toast('Não consegui gerar o backup.'); }
  });
  f.querySelector('#f-adotar').onsubmit = async (ev) => {
    ev.preventDefault();
    const botao = f.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Baixando…';
    try {
      await nuvem.adotarCofreDaNuvem(remoto, f.querySelector('#d-senha').value);
      fecharFolha();
      toast('Pronto: os dados da nuvem chegaram ✦');
      desenhar(el);
    } catch (e) {
      botao.disabled = false; botao.textContent = 'Trazer os dados';
      f.querySelector('#d-erro').textContent = e.message;
    }
  };
}
