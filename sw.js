/* =========================================================
   Sistema · service worker
   Guarda uma cópia dos arquivos do sistema no aparelho para
   ele abrir sem internet. NÃO guarda dados (os dados ficam no
   cofre). Estratégia: tenta a internet primeiro (para pegar a
   versão mais nova); se não tiver, usa a cópia guardada.

   Ao acrescentar um arquivo novo ao sistema, coloque-o na lista
   ARQUIVOS e aumente o número da VERSAO.
   ========================================================= */

importScripts('config.js');

const VERSAO = `${self.CONFIG.id}-v1`;

const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'css/tema.css',
  'css/app.css',
  'fontes/eb-garamond-latin-400-normal.woff2',
  'fontes/eb-garamond-latin-500-normal.woff2',
  ...[self.CONFIG.logo.claro, self.CONFIG.logo.escuro].filter(Boolean),
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/apple-touch-icon.png',
  'js/app.js',
  'js/nucleo/marca.js',
  'js/nucleo/util.js',
  'js/nucleo/cripto.js',
  'js/nucleo/cofre.js',
  'js/nucleo/dados.js',
  'js/nucleo/backup.js',
  'js/nucleo/ui.js',
  'js/nucleo/avisos.js',
  'js/nucleo/graficos.js',
  'js/nucleo/sincronia.js',
  'js/nucleo/lembretes.js',
  'js/modulos/tarefas.js',
  'js/modulos/habitos.js',
  'js/modulos/gastos.js',
  'js/modulos/entradas.js',
  'js/modulos/clientes.js',
  'js/modulos/compromissos.js',
  'js/modulos/metas.js',
  'js/modulos/vencimentos.js',
  'js/modulos/revisao.js',
  'js/modulos/estudos.js',
  'js/modulos/analise.js',
  'js/telas/bloqueio.js',
  'js/telas/hoje.js',
  'js/telas/clientes.js',
  'js/telas/agenda.js',
  'js/telas/dinheiro.js',
  'js/telas/metas.js',
  'js/telas/vencimentos.js',
  'js/telas/revisao.js',
  'js/telas/estudos.js',
  'js/telas/rotina.js',
  'js/telas/mais.js',
  'js/telas/ajustes.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = busca sempre a versão mais nova, ignorando cópias antigas do navegador
  e.waitUntil(caches.open(VERSAO)
    .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // "no-cache": sempre confere com o servidor se há versão nova (evita ficar preso numa cópia antiga)
    fetch(req, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
