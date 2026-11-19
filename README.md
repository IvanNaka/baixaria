# Baixo Estudo

Aplicação web (Angular 20) para estudo de contrabaixo.

## Funcionalidades

**Notas no braço** (`/notas`)
- *Qual é a nota?* — uma posição é marcada no braço e você escolhe o nome da nota.
- *Encontre na corda* — clique na casa da nota pedida, na corda indicada.
- *Todas as posições* — encontre todas as ocorrências de uma nota na faixa escolhida.

**Intervalos** (`/intervalos`)
- *Identifique no braço* — tônica (R) e alvo (?) marcados; diga qual é o intervalo.
- *Encontre o intervalo* — dada a tônica e o intervalo, clique onde ele está.
- *Treino de ouvido* — ouça duas notas (melódico ou harmônico) e identifique o intervalo.
- Seleção de intervalos (2m a 8J), direção ascendente/descendente e opção de "formas próximas".

**Tocar no baixo — com microfone** (`/microfone`)

Você responde tocando o instrumento; a app reconhece a nota pelo microfone.
- *Afinador* — nota, frequência, desvio em cents e indicação da corda.
- *Toque a nota* — a app pede uma nota (ex.: F#) e você toca em qualquer lugar do braço.
- *Toque na corda* — toque a nota pedida na corda indicada, dentro da faixa de casas escolhida.
- *Intervalos* — a app toca e marca a tônica; você toca o intervalo pedido.
- *Desafio cronometrado* — notas naturais ou cromática numa corda, ciclo de quartas ou escala
  maior, contra o relógio, com recorde salvo.

Dicas: use uma interface de áudio com cabo ou deixe o microfone perto do amplificador; ajuste a
*sensibilidade* para que a linha do medidor fique acima do ruído ambiente. Por padrão a nota é
aceita em qualquer oitava (microfones pequenos às vezes confundem a oitava dos graves); ligue
*Exigir oitava exata* para treinar a posição exata. A app não tem como saber em qual corda você
tocou — só a altura da nota.

**Se o microfone não for reconhecido:**
- O navegador só libera o microfone em `http://localhost` ou `https://`. Para abrir em outro
  aparelho da rede (ex.: celular), rode `npm run start:rede` e acesse `https://<ip-do-computador>:4200`
  (aceite o aviso de certificado).
- Escolha a entrada correta na lista *Entrada de áudio* (os nomes aparecem após a permissão; use
  *↻ Atualizar lista* depois de conectar uma interface).
- Confira a permissão do site e a do sistema operacional (Windows: Privacidade › Microfone; macOS:
  Privacidade e Segurança › Microfone) e se outro programa (DAW, driver ASIO) não está usando a
  entrada em modo exclusivo.
- A linha de diagnóstico abaixo do medidor mostra o volume em dB e a frequência detectada: se o
  sinal estiver abaixo do mínimo, aumente o ganho da interface ou a sensibilidade.

**Mapa do braço** (`/mapa`) — todas as notas ou todos os intervalos a partir de uma tônica; clique para ouvir.

**Mapa de intervalos** (`/mapa?ver=intervalos`) — clique numa casa para definir a tônica e veja
cada intervalo com uma cor. Filtre intervalos ou use atalhos (tríades, acordes com sétima,
pentatônicas, escalas maior e menor); rótulos em graus (3M, 5J) ou distância real (10M, ↓4J);
modo "região da mão" (±4 casas); tabela de formas mostrando onde cada intervalo fica na mesma
corda e nas cordas de cima.

**Estatísticas** (`/estatisticas`) — precisão por nota, por posição (mapa de calor) e por intervalo.

Em todos os exercícios é possível limitar a faixa de casas e as cordas. O sorteio é **adaptativo**:
o que você erra mais aparece mais vezes.

Configurações globais (barra superior): afinação (4, 5 ou 6 cordas, Drop D), notação (C D E ou
Dó Ré Mi), sustenidos/bemóis, som e tocar uma oitava acima (melhor em alto-falantes pequenos).

## Rodando

```bash
npm install
npm start          # http://localhost:4200
npm test           # testes unitários (Karma + Jasmine)
npm run build      # build de produção em dist/
```

## Arquitetura

```
src/app/
  core/
    music.ts             teoria: notas, afinações, posições, intervalos, sorteio ponderado
    settings.service.ts  preferências globais (persistidas em localStorage)
    stats.service.ts     histórico de acertos/erros + pesos do sorteio adaptativo
    audio.service.ts     síntese de som de baixo com Web Audio API
    pitch.ts             conversão frequência→nota e estabilizador de ataques (lógica pura)
    microphone.service.ts captura do microfone + detecção de altura (pitchy, algoritmo McLeod)
    score.ts             placar da sessão
  shared/
    fretboard.*          braço do baixo em SVG (marcadores, cliques, faixa ativa)
    range-picker.ts      seleção de casas/cordas
    score-bar.ts         placar
  pages/                 inicio, notas, intervalos, microfone, mapa, estatisticas
```

Não há back end: todo o progresso fica no `localStorage` do navegador. Um back end em .NET
passa a fazer sentido se você quiser contas de usuário, sincronizar o progresso entre
dispositivos ou ranking — o `StatsService` é o ponto único a trocar por chamadas HTTP.
