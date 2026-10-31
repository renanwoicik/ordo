# Ordo

Painel da vida profissional e pessoal, para iPhone e computador: Hoje, dinheiro, rotina (tarefas, hábitos e metas), estudos, vencimentos e revisão semanal. Os módulos específicos de cada profissão entram por cima desta base.

Não precisa de nada instalado no Mac: são arquivos HTML, CSS e JavaScript puros.

---

## Criar uma versão nova

1. **Copie esta pasta** para outra, fora do iCloud (por exemplo `~/MeuSistema`).
2. **Abra `config.js`** e troque:

| Campo | O que é |
|---|---|
| `id` | Nome curto, sem espaço nem acento. Separa os dados desta versão. Não mude depois de começar a usar. |
| `nome`, `descricao` | Como o app aparece no iPhone e nas telas. |
| `logo` | Caminho das imagens (ex.: `icones/logo.png`). Vazio = mostra o nome em texto. |
| `cores` | Destaque, fundo e cor do ícone. Os demais tons ficam em `css/tema.css`. |
| `nuvem` | URL e chave "publishable" do projeto Supabase **próprio**. Vazio = sem sincronização. |
| `github` | A conta e o repositório **próprios** para publicar. |

3. Rode `ruby ferramentas/aplicar-config.rb`, que atualiza o manifesto, o título e os ícones.
4. Dê dois cliques em **Abrir.command** para ver no Mac em `http://localhost:8686`. Se for usar junto com outra versão, troque a porta em `ferramentas/servidor.rb` e no atalho.

`config.js` vai para o GitHub público. **Nunca escreva nele** nomes de pessoas, valores ou dados de clientes. O nome da pessoa fica em **Mais → Ajustes**, dentro do cofre.

---

## Contas próprias

Cada versão tem o seu GitHub, o seu Supabase, a sua senha e a sua chave de recuperação. Nunca compartilhe essas contas entre pessoas: os dados precisam ficar separados.

### Publicar
1. O GitHub CLI precisa estar em `~/.local/bin/gh`.
2. Preencha `github.conta` e `github.repositorio` no `config.js`.
3. Dê dois cliques em **Publicar.command**.

**Trava de segurança:** o script só envia se o token for da conta escrita em `github.conta`. Se for outra, ele para sem enviar nada.

**Token:** na primeira publicação, crie um token em github.com/settings/tokens com a permissão `repo` e cole quando o script pedir. Ele fica em `~/.config/gh-<id>/token`, fora desta pasta. Nunca use `gh auth login` para isso: ele mexe no chaveiro do Mac e atrapalha outras contas.

### Sincronizar Mac e iPhone
1. Crie um projeto no Supabase, de preferência na região São Paulo.
2. No SQL Editor, cole o conteúdo de `ferramentas/nuvem.sql`.
3. Crie o usuário em Authentication e desligue o cadastro público.
4. Copie a URL e a chave "publishable" para `nuvem` no `config.js` e publique.
5. Em Mais → Ajustes → Sincronização, ligue primeiro no aparelho que tem os dados. Os outros adotam o cofre com a mesma senha.

A nuvem só recebe dados já embaralhados.

---

## Instalar no iPhone

1. Abra o endereço publicado no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Use sempre o ícone da tela de início: o app instalado guarda os dados separados do Safari.

---

## Senha, chave de recuperação e backup

- A senha abre o cofre. A chave de recuperação aparece **uma vez só**: guarde no app Senhas e num papel.
- **Sem a senha e sem a chave, ninguém recupera os dados.**
- Backup: Mais → Ajustes e backup → **Fazer backup agora**. O arquivo `.cofre` vai embaralhado; guarde numa pasta de nuvem pessoal. O painel Hoje avisa quando passar de 7 dias.

---

## Como o código está organizado

| Onde | O que tem |
|---|---|
| `config.js` | Nome, logo, cores e chaves. |
| `js/nucleo/` | Cofre, criptografia, dados, backup, sincronização, interface, avisos, gráficos, lembretes. |
| `js/modulos/` | Regras: tarefas, hábitos, metas, gastos, entradas, estudos, vencimentos, revisão, análise. |
| `js/telas/` | Telas: Hoje, Dinheiro, Rotina, Mais, Ajustes e as demais. |
| `sw.js` | Modo sem internet. Ao criar um arquivo, ponha na lista ARQUIVOS e aumente o número da VERSAO. |

**Módulo novo:** crie o arquivo em `js/modulos/`, a tela em `js/telas/`, registre em `js/app.js` (ou `js/telas/mais.js`) e em `sw.js`. Telas que ligam eventos usam `areaLimpa(el)`. Avisos têm id estável.

**Dinheiro:** o módulo `entradas.js` é um lançamento simples. Um módulo de receita da profissão deve somar ou substituir `E.total(ym)`, usado no Resumo geral, nas metas, na revisão e na análise. Custos do negócio contam uma vez só: as contas fixas do CNPJ.
