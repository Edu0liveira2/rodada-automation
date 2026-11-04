# rodada-automation

Agendador sem navegador para uma conta de teste do [Rodada](https://rodada.io). Um PC Linux ligado faz uma chamada autenticada às 00:01 em `America/Sao_Paulo`. O servidor Rodada calcula e registra as partidas usando suas próprias engines. Não é necessário entrar com o Google a cada execução.

## Estado do projeto

Este repositório contém o **cliente agendado**, sua validação e o timer do systemd. A rota `POST /api/automation/daily` **ainda não existe** no Rodada. Antes de ativar o timer, é preciso implementá-la e publicá-la no projeto do site. O cliente falha se a resposta não confirmar os 16 jogos.

Contrato esperado da rota:

- Recebe `Authorization: Bearer <RODADA_AUTOMATION_SECRET>` e `{ "dateKey": "AAAA-MM-DD" }`.
- Usa um **ID de conta fixo em variável de ambiente no deploy**. Nunca aceita `accountId` do pedido.
- Confere que `dateKey` é o dia atual em Brasília e calcula as respostas no servidor com a seed e os dados do próprio deploy.
- Registra cada partida de modo idempotente. Uma nova chamada no mesmo dia devolve `existing` para as partidas já gravadas.
- Responde `{"dateKey":"AAAA-MM-DD","results":[{"slug":"palavra","state":"created"}, ...]}` com os 16 slugs e `state` igual a `created` ou `existing`.

O ID da conta não é credencial. O segredo compartilhado autoriza a chamada; mantenha-o apenas nas variáveis do deploy e no arquivo de ambiente do PC. Não grave cookies, senha ou tokens do Google neste projeto.

## Preparar o PC

Requer Node.js 20+ e Linux com systemd. Clone o repositório em `~/rodada-automation` e execute:

```bash
mkdir -p ~/.config/rodada-automation ~/.config/systemd/user
cp .env.example ~/.config/rodada-automation/env
chmod 600 ~/.config/rodada-automation/env
cp systemd/rodada-automation.service systemd/rodada-automation.timer ~/.config/systemd/user/
```

Edite `~/.config/rodada-automation/env` com o **mesmo** segredo configurado na Vercel. Gere um segredo com `openssl rand -hex 32`. Configure a rota no site antes de ativar o timer.

```bash
set -a
. ~/.config/rodada-automation/env
set +a
npm run check
npm test
systemd-analyze calendar '*-*-* 00:01:00 America/Sao_Paulo'
systemctl --user daemon-reload
systemctl --user enable --now rodada-automation.timer
systemctl --user list-timers rodada-automation.timer
```

Para que um timer de usuário continue ativo sem login no PC, habilite linger uma vez com `sudo loginctl enable-linger "$USER"`. O PC precisa permanecer ligado e com internet. `Persistent=true` faz uma execução de recuperação quando o PC voltar após perder o horário; o servidor deve garantir que repetir o mesmo dia não duplique partidas.

Para executar manualmente após a rota estar publicada:

```bash
set -a
. ~/.config/rodada-automation/env
set +a
npm run run
journalctl --user -u rodada-automation.service -n 50 --no-pager
```

O programa não imprime o segredo. Ele encerra com código diferente de zero se a chamada falhar ou se algum dos 16 resultados estiver ausente.
