# Convite de avaliador por link e música do pódio por arquivo

## 1. Música do pódio (aba **Bancas → [banca] → Pódio**)

**O que estava errado:** o campo só aceitava o *link direto* de um arquivo de áudio. Links de YouTube/Spotify/Drive não tocam, e quando o `play()` falhava o sistema caía em silêncio num bipe, sem avisar. O áudio também era disparado dentro de um `setTimeout`, o que Safari/iOS bloqueiam.

**Como ficou**
- **Escolher arquivo de áudio** (o que você baixou): MP3, WAV ou OGG, até 20 MB (mesmos limites do bucket `winner-music`).
- Validação antes de salvar: extensão, tamanho, **conteúdo real do arquivo** (assinatura MP3/WAV/OGG; um `.exe` renomeado para `.mp3` é recusado) e se o navegador consegue decodificar.
- **Pré-escuta** na própria tela, **Trocar arquivo** e **Remover música**; o título vem do nome do arquivo e é editável.
- O link direto continua existindo, mas escondido em "avançado", com a explicação do que funciona.
- No pódio o áudio é "destravado" dentro do clique em *Modo apresentação* (funciona em Safari/iOS) e, se o arquivo não tocar, aparece um **aviso** ao lado do bipe padrão.
- Arquivos: `servicos/audio.ts` (validação), `pages/BancaDetalhe.tsx` (aba Pódio), `pages/Resultados.tsx` (reprodução).

**Backend** (`PUT/DELETE /boards/:id/presentation/music`): o corpo é o próprio arquivo; o servidor confere a assinatura, grava no bucket privado `winner-music` (`<instituição>/<banca>/<uuid>.<ext>`), apaga o arquivo anterior e guarda `storage:winner-music/...` em `presentation_settings.music_url`. `GET /boards/:id/presentation` devolve um **link assinado de 1 h** (`music_url`) e `music_is_file`. `PUT /boards/:id/presentation` ganhou `keepUploadedMusic` (não sobrescreve o arquivo enviado). Cabeçalho `x-file-name` leva o nome original.

## 2. Convite de avaliador por link

**Quem gera:** administrador (na tela do **projeto** e na tela da **banca**) e superadministrador (painel **Plataforma → Convidar avaliador**, escolhendo instituição → banca → projeto). Coordenador não gera.

**Fluxo**
1. Admin abre um projeto (Projetos → clicar no projeto → **Convidar avaliador**) ou uma banca (botão **Convidar avaliador** no topo / aba **Convites**), escolhe validade (1 h a 7 dias) e quantas pessoas podem usar (1 a 10) e clica **Gerar link de convite**.
2. Copia o link ou envia por WhatsApp. O link só é mostrado nesse momento (no banco fica apenas o hash).
3. O convidado abre o link gerado (agora no formato `…/?convite=<token>`), vê o projeto, informa **nome e e-mail (obrigatórios)** e **instituição (opcional)**, e clica **Quero avaliar este projeto**. O formato usa a página inicial para funcionar também em hospedagens estáticas que não configuram fallback de rotas. Links antigos no formato `…/convite/<token>` continuam suportados pelo frontend quando a hospedagem redireciona essas URLs para `index.html`.
4. Recebe uma **senha temporária** (mostrada uma vez, com botão copiar) e entra direto em **Avaliar**.

**Restrição:** o convidado vira avaliador **somente daquele projeto naquela banca**. Ele só vê esse projeto e essa banca, só lança nota nele, não vê menus administrativos e digitar `/bancas`, `/auditoria` etc. na URL o devolve para `/avaliar`. Não pode ser designado a outra banca. Se for bloqueado em **Pessoas**, perde o acesso na chamada seguinte.

**Segurança**
- Token de 256 bits; só o SHA-256 é guardado. Expira, tem limite de usos e pode ser **revogado**.
- Link inexistente, expirado, esgotado, revogado, de banca encerrada ou de instituição suspensa dão **a mesma resposta** (410) — não revela nada a quem adivinha links.
- E-mail que já tem conta **não** entra pelo convite (evita tomar contas existentes); a pessoa deve entrar com a própria senha.
- No banco, `claim_board_invitation` reserva a vaga de forma atômica e dois *triggers* (`enforce_evaluator_scope_*`) recusam nota/designação fora do escopo, mesmo que uma rota esqueça de checar.
- Criação, aceite e revogação ficam na **auditoria**; o token nunca é gravado.

**Backend:** `POST/GET/DELETE /invitations` (admin; superadmin envia `x-institution-id`), `GET /public/invitations/:token`, `POST /public/invitations/:token/accept`. Migração: `supabase/migrations/20261101000000_board_invitations.sql` (**aplique antes de usar**).

## 3. Verificado × não verificado
- **Executado:** 36 testes da camada de dados do frontend (7 novos: convite + áudio), 33 do backend (6 novos: validade do link, escopo do convidado), roteiros no Chromium (upload de WAV real, pódio tocando o arquivo **sem** flag de autoplay, recusa de `.exe` e de `.mp3` falso, fluxo completo do convite, bloqueio de URL administrativa).
- **Não executado (precisa do seu ambiente):** a migração e as rotas novas contra um Supabase real; `tsc` do backend com os tipos reais. Escrevi no padrão que vocês já usam (`as unknown as Row[]`), mas rode `npx tsc --noEmit -p tsconfig.server.json` e me diga se algo reclamar.

## 4. Limitações
- No **mock** o arquivo de música fica na memória da aba (some ao recarregar), como todo o resto dos dados do mock; no backend real ele vai para o Storage.
- Formatos: só MP3/WAV/OGG (o bucket não aceita M4A/AAC).
- O superadmin gera o convite pelo painel da Plataforma (nomes de instituição/banca/projeto), sem abrir as telas internas de projeto/banca de cada instituição.
- A senha temporária é exibida na tela (sem envio de e-mail); o convidado pode trocá-la em **Meu perfil**.
