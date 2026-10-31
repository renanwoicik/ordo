/* =========================================================
   Sistema · tela de senha
   Três situações:
   - primeiro acesso: boas-vindas → criar senha → guardar a
     chave de recuperação;
   - entrar: digitar a senha;
   - recuperar: esqueceu a senha → chave de recuperação →
     senha nova.
   ========================================================= */

import { logoHtml, MARCA } from '../nucleo/marca.js';
import * as cofre from '../nucleo/cofre.js';
import { esc } from '../nucleo/util.js';

const SENHA_MINIMA = 8;
const caixa = () => document.getElementById('bloqueio');

const marca = (sub) => `
  <div class="marca">
    ${logoHtml()}
    ${sub ? `<p>${sub}</p>` : ''}
  </div>`;

const passos = (n) => `<div class="passos" aria-label="Passo ${n} de 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

/** Mostra a tela de senha e só resolve quando o cofre estiver aberto. */
export async function pedirSenha() {
  const el = caixa();
  el.hidden = false;
  const jaExiste = await cofre.existe();
  await new Promise((pronto) => (jaExiste ? telaEntrar(pronto) : telaBoasVindas(pronto)));
  el.hidden = true;
  el.innerHTML = '';
}

/* ---------- primeiro acesso ---------- */

function telaBoasVindas(pronto) {
  caixa().innerHTML = `<div class="caixa">
    ${marca('O painel da sua vida, num lugar só.')}
    ${passos(1)}
    <div class="card texto">
      <p><b>Seus dados ficam protegidos por uma senha.</b></p>
      <ul>
        <li>Tudo é guardado embaralhado neste aparelho.</li>
        <li>Sem a senha, ninguém lê nada: nem quem pegar o celular, nem a nuvem.</li>
        <li>Você também vai receber uma <b>chave de recuperação</b>, para o caso de esquecer a senha.</li>
      </ul>
    </div>
    <button class="btn pri" id="b-comecar">Criar minha senha</button>
  </div>`;
  document.getElementById('b-comecar').onclick = () => telaCriarSenha(pronto);
}

function telaCriarSenha(pronto) {
  caixa().innerHTML = `<form class="caixa" id="f-criar" novalidate>
    ${marca()}
    ${passos(2)}
    <div class="card">
      <div class="fld">
        <label for="s1">Crie uma senha</label>
        <input id="s1" type="password" autocomplete="new-password" minlength="${SENHA_MINIMA}" required>
        <small>Pelo menos ${SENHA_MINIMA} caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar, ex.: "cafe com canela 2026".</small>
      </div>
      <div class="fld">
        <label for="s2">Repita a senha</label>
        <input id="s2" type="password" autocomplete="new-password" required>
      </div>
      <div class="erro" id="erro" role="alert"></div>
      <button class="btn pri" type="submit" style="width:100%">Continuar</button>
    </div>
  </form>`;
  const form = document.getElementById('f-criar');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const s1 = form.s1.value, s2 = form.s2.value;
    const erro = document.getElementById('erro');
    if (s1.length < SENHA_MINIMA) { erro.textContent = `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`; return; }
    if (s1 !== s2) { erro.textContent = 'As duas senhas não estão iguais.'; return; }
    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Protegendo…';
    const chaveRec = await cofre.criar(s1);
    telaChaveRecuperacao(chaveRec, pronto);
  };
  setTimeout(() => form.s1.focus(), 50);
}

/** Também usada em Ajustes ao gerar uma chave nova. */
export function htmlChave(chaveRec) {
  return `
    <div class="chave" id="chave-rec">${esc(chaveRec)}</div>
    <div class="acts">
      <button type="button" class="btn sec" id="b-copiar">Copiar</button>
      ${navigator.share ? '<button type="button" class="btn sec" id="b-partilhar">Salvar em…</button>' : ''}
    </div>`;
}

export function ligarBotoesChave(chaveRec, avisar) {
  document.getElementById('b-copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(chaveRec); avisar('Chave copiada.'); } catch { avisar('Não consegui copiar. Selecione o texto e copie.'); }
  };
  const p = document.getElementById('b-partilhar');
  if (p) p.onclick = () => navigator.share({ title: `Chave de recuperação do ${MARCA.nome}`, text: chaveRec }).catch(() => {});
}

function telaChaveRecuperacao(chaveRec, pronto) {
  caixa().innerHTML = `<div class="caixa">
    ${marca()}
    ${passos(3)}
    <div class="card texto">
      <p><b>Esta é a sua chave de recuperação.</b></p>
      <p>Se um dia esquecer a senha, só ela abre os seus dados. Ela aparece <b>só agora</b>.</p>
      ${htmlChave(chaveRec)}
      <p style="margin-top:14px;color:var(--soft);font-size:13.5px">Sugestão: guarde no seu app de senhas (como uma nota) <b>e</b> num papel em casa. Não mande por WhatsApp nem e-mail.</p>
      <label class="chk"><input type="checkbox" id="c-guardei"> Guardei a minha chave em um lugar seguro.</label>
      <button class="btn pri" id="b-pronto" style="width:100%" disabled>Começar a usar</button>
    </div>
  </div>`;
  const aviso = (m) => { const b = document.getElementById('b-copiar'); b.textContent = m.startsWith('Chave') ? 'Copiada ✓' : 'Copiar'; };
  ligarBotoesChave(chaveRec, aviso);
  const c = document.getElementById('c-guardei');
  const b = document.getElementById('b-pronto');
  c.onchange = () => { b.disabled = !c.checked; };
  b.onclick = () => pronto();
}

/* ---------- entrar ---------- */

function telaEntrar(pronto) {
  caixa().innerHTML = `<form class="caixa" id="f-entrar" novalidate>
    ${marca('Digite a sua senha para abrir.')}
    <div class="card">
      <div class="fld">
        <label for="senha">Senha</label>
        <input id="senha" type="password" autocomplete="current-password" required>
      </div>
      <div class="erro" id="erro" role="alert"></div>
      <button class="btn pri" type="submit" style="width:100%">Abrir</button>
    </div>
    <button type="button" class="link" id="b-esqueci">Esqueci a senha</button>
  </form>`;
  const form = document.getElementById('f-entrar');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Abrindo…';
    if (await cofre.abrir(form.senha.value)) return pronto();
    botao.disabled = false; botao.textContent = 'Abrir';
    document.getElementById('erro').textContent = 'Senha incorreta. Tente de novo.';
    form.senha.select();
  };
  document.getElementById('b-esqueci').onclick = () => telaRecuperar(pronto);
  setTimeout(() => form.senha.focus(), 50);
}

/* ---------- recuperar ---------- */

function telaRecuperar(pronto) {
  caixa().innerHTML = `<form class="caixa" id="f-rec" novalidate>
    ${marca('Use a sua chave de recuperação para criar uma senha nova.')}
    <div class="card">
      <div class="fld">
        <label for="chave">Chave de recuperação</label>
        <input id="chave" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-…">
      </div>
      <div class="fld">
        <label for="s1">Senha nova</label>
        <input id="s1" type="password" autocomplete="new-password">
        <small>Pelo menos ${SENHA_MINIMA} caracteres.</small>
      </div>
      <div class="fld">
        <label for="s2">Repita a senha nova</label>
        <input id="s2" type="password" autocomplete="new-password">
      </div>
      <div class="erro" id="erro" role="alert"></div>
      <button class="btn pri" type="submit" style="width:100%">Recuperar</button>
    </div>
    <button type="button" class="link" id="b-voltar">Voltar para a senha</button>
  </form>`;
  const form = document.getElementById('f-rec');
  const erro = document.getElementById('erro');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (form.s1.value.length < SENHA_MINIMA) { erro.textContent = `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`; return; }
    if (form.s1.value !== form.s2.value) { erro.textContent = 'As duas senhas não estão iguais.'; return; }
    const botao = form.querySelector('button[type=submit]');
    botao.disabled = true; botao.textContent = 'Conferindo…';
    if (await cofre.recuperar(form.chave.value, form.s1.value)) return pronto();
    botao.disabled = false; botao.textContent = 'Recuperar';
    erro.textContent = 'Essa chave de recuperação não confere.';
  };
  document.getElementById('b-voltar').onclick = () => telaEntrar(pronto);
}
