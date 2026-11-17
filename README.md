# rodada-automation

Cliente **externo** para jogar diariamente os 21 jogos de [rodada.io](https://rodada.io) com uma conta de teste. Ele roda em outro PC Linux, calcula as respostas localmente e usa as rotas públicas já existentes (`/api/me`, `/api/plays/start` e `/api/plays`). Não precisa instalar navegador nem alterar o servidor Rodada.

O script manual original para colar no Console do navegador está em [`devtools/rodada-audit.js`](devtools/rodada-audit.js). Ele usa a sessão já aberta no navegador e pede confirmação antes de enviar as partidas do dia.

## Atualizar uma instalação anterior

Se o timer já está instalado no outro PC, atualize o código e o commit dos dados no arquivo de ambiente. Mantenha o cookie e o e-mail existentes:

```bash
cd ~/rodada-automation
git pull
nano ~/.config/rodada-automation/env
```

Defina `RODADA_SOURCE_REF=445bb012ce63af3821d5e8117dbf1b8a552f69f7`, salve o arquivo e execute `systemctl --user start rodada-automation.service`. O timer já instalado usará o código novo na próxima execução; confira o resultado com `journalctl --user -u rodada-automation.service -n 50 --no-pager`.

O cálculo usa a seed `rodada-dev` e os dados públicos do commit `445bb012ce63af3821d5e8117dbf1b8a552f69f7`. Se o deploy mudar a seed, as listas ou as regras, atualize a configuração ou o cálculo antes da próxima execução. O programa para ao encontrar uma partida não vencida. Escala e Escala Países terminam com `done` e só passam na validação se a nota for 100.

## Autenticação

O Rodada exige uma sessão válida. Faça login **uma vez** na conta de teste pelo navegador e copie o cookie `better-auth.session_token` (ou `__Secure-better-auth.session_token`) em DevTools → Application → Cookies → `https://rodada.io`. No PC da automação, guarde o nome e o valor no arquivo `~/.config/rodada-automation/env`, no formato mostrado em `.env.example`. Configure também `RODADA_EXPECTED_EMAIL` para impedir que um cookie de outra conta seja usado por engano.

O ID público da conta não autentica ninguém. O cookie é uma credencial: não o publique, não cole em issues e mantenha o arquivo com permissão `600`. A sessão pode expirar ou ser revogada; nesse caso, o programa encerra com erro 401 e será preciso renovar o cookie. Não há login diário com Google enquanto a sessão permanecer válida.

## Instalação no outro PC

Requer Node.js 20+, Linux com systemd, `gh` autenticado na sua conta GitHub e acesso a `rodada.io` e `raw.githubusercontent.com`. O repositório é privado.

```bash
gh repo clone Edu0liveira2/rodada-automation ~/rodada-automation
cd ~/rodada-automation
mkdir -p ~/.config/rodada-automation ~/.config/systemd/user
cp .env.example ~/.config/rodada-automation/env
chmod 600 ~/.config/rodada-automation/env
cp systemd/rodada-automation.service systemd/rodada-automation.timer ~/.config/systemd/user/
```

Edite `~/.config/rodada-automation/env` e substitua o cookie e o e-mail de exemplo. Depois valide a configuração e faça uma execução manual:

```bash
set -a
. ~/.config/rodada-automation/env
set +a
npm run check
npm test
npm run run
```

Se essa execução terminar com `created + existing = 21`, ative o agendamento:

```bash
systemd-analyze calendar '*-*-* 00:01:00 America/Sao_Paulo'
systemctl --user daemon-reload
systemctl --user enable --now rodada-automation.timer
systemctl --user list-timers rodada-automation.timer
```

Para manter o timer de usuário ativo sem login, execute uma vez `sudo loginctl enable-linger "$USER"`. O PC deve permanecer ligado e conectado à internet. `Persistent=true` executa a tarefa ao voltar de uma queda após o horário. Partidas já registradas são ignoradas.

Consulte a última execução com `journalctl --user -u rodada-automation.service -n 50 --no-pager`. O programa imprime apenas a data e a contagem de partidas criadas ou já existentes; não imprime o cookie.
