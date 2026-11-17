# @golden-era/duel-engine

Motor de regras de duelo, **determinístico e sem dependências**, para um futuro modo jogador × jogador.
As regras são **regras da casa inspiradas no Forbidden Memories**: não são uma cópia das do jogo original
(estrelas, custos e fusões usam dados do nosso catálogo e fórmulas próprias). Os efeitos das cartas estão
**desligados**: só valem ATK, DEF, nível, atributo e espécie.

Este pacote é só o "cérebro" (regras + simulação). Não tem rede, tela nem banco; isso vem depois.

## Regras

| Tema | Regra |
|---|---|
| Baralho | exatamente 40 monstros, até 3 cópias de cada, sem fusões. Fusões nascem só de receitas |
| Preparação | 8000 de vida, compra 5 cartas; o jogador 0 começa |
| Turno | compra até completar 5 cartas na mão (se o baralho não der, quem ia comprar perde); depois joga, ataca e termina o turno |
| Jogar | **uma vez por turno**: uma carta, ou várias da mão formando uma **fusão**. Sem tributo. Escolhe posição (ataque, defesa ou virada para baixo) e uma das duas estrelas da carta. Campo de 5 monstros |
| Fusão | combina cartas da mão (2 ou 3 materiais, em qualquer ordem) segundo as receitas do catálogo; dá para encadear (resultado + outra carta). Materiais vão ao cemitério. Se os mesmos materiais geram duas fusões, o jogador escolhe |
| Atacar | só monstros em ataque, uma vez por turno, e não no turno em que foram jogados. Com o campo do oponente vazio o ataque é direto (ATK inteiro) |
| Ataque × ataque | o maior ATK destrói o menor e a diferença vira dano; empate destrói os dois |
| Ataque × defesa | ATK maior destrói sem dano; ATK menor machuca **quem atacou** pela diferença; igual não faz nada. Monstro virado para baixo é revelado ao ser atacado |
| Posição | uma troca por turno, nunca no turno em que o monstro foi jogado nem depois de atacar |
| Estrelas | 10 estrelas em duas rodas (A: sol > lua > vênus > mercúrio > sol; B: marte > júpiter > saturno > urano > plutão > netuno > marte). Quem tem a vantagem ganha +500 de ATK/DEF e o outro perde 500, **só na batalha** |
| Fim | vida em 0, baralho vazio na compra, ou limite de 80 turnos (empate) |
| Custo do baralho | cada carta tem um custo (`cardCost`); o motor aceita um teto opcional. **Ainda não calibrado** (veja abaixo) |

As estrelas de cada carta saem de uma tabela por atributo e de um hash do id (`src/stars.ts`): estável, mas inventada por nós.

## Uso

```ts
import { applyAction, buildRules, createGame, legalActions } from "@golden-era/duel-engine";
import data from "@golden-era/duel-engine/data/fm-pool.json";

const rules = buildRules(data);
let game = createGame(rules, [deckA, deckB], /* semente */ 42);

const actions = legalActions(rules, game);                  // tudo que o jogador da vez pode fazer
const { state, events } = applyAction(rules, game, actions[0]!); // estado novo + eventos (para animar a tela)
game = state;
```

- `applyAction` **não altera** o estado recebido e lança `IllegalActionError` para jogadas inválidas.
- Mesma semente + mesmas ações = exatamente a mesma partida (replays e sincronização por lockstep).
- O estado é JSON puro; o gerador aleatório (mulberry32) mora dentro dele.

## Dados

`data/fm-pool.json` vem do catálogo (`npm run build-pool -w @golden-era/duel-engine`, com a API rodando):

- 1085 monstros de baralho (todos os não-fusão com ATK/DEF fixos) e 69 monstros de fusão;
- 66 receitas lidas do início do texto de cada fusão (`"A" + "B"`); 1 receita genérica (Five-Headed Dragon),
  2 com material fora do catálogo (Amphibious Bugroth, Reaper on the Nightmare) e 3 monstros sem ATK/DEF fixo
  (`-1` no catálogo) ficam de fora. Uma receita é ambígua: Robolady + Roboyarou.

## Comandos

```bash
npm test -w @golden-era/duel-engine          # 34 testes (regras, fusões, estrelas, dados reais, partidas inteiras com bots)
npm run typecheck -w @golden-era/duel-engine
npm run simulate -w @golden-era/duel-engine  # N=300 por linha; grava data/sim-report.md (N=1000 SEED=7 para variar)
```

## O que a primeira bateria de simulações mostrou

(Bot "esperto" = funde quando pode, joga o mais forte, só ataca quando ganha. Detalhes em `data/sim-report.md`.)

- **O jogo anda:** ~29 turnos por partida; 77% terminam por vida, 13% por baralho vazio e 10% no limite de turnos.
- **Quem começa não leva vantagem:** o primeiro jogador vence ~46% (ligeiramente atrás). Não é um problema.
- **Há habilidade:** o bot esperto vence o aleatório em ~93% das partidas, então as decisões importam.
- **Fusões são usadas, mas não dão vantagem:** no todos-contra-todos o estilo "Fusão" vence ~33%, o mesmo que o
  "Aleatório" (~33%). Numa rodada anterior (N=400, só esse confronto) um baralho montado para fundir tinha fusão em ~76% das
  partidas e ganhava de um aleatório em 44% a 46%, ou seja, não passava de empate técnico. Falta um incentivo
  (poder ou custo dos resultados da fusão).
- **O custo ainda não equilibra nada.** Sem teto, o baralho dos 40 monstros mais fortes vence ~83% contra qualquer
  coisa. Cinco fórmulas de custo (linear, convexas, só estatística) e vários tetos não derrubaram essa dominância:
  baralhos que empilham ATK ou DEF altos ganham de 65% a 85% dos confrontos. Limitar cartas "de elite" também não ajudou
  (o domínio vem dos ~2000 de ATK, não só dos monstros de 2500+).
  **Leitura:** sem tributo e com batalha puramente estatística, o jogo premia quem empilha números. O teto de custo
  precisa ser calibrado com partidas de gente de verdade, ou o desenho precisa de outra alavanca (por exemplo: efeitos que
  punem decks "só de estatística", terreno que muda os números, limite de cópias por poder, ou fusões como único caminho
  para monstros fortes, como no jogo original).

## Limites desta fase e próximos passos

- Sem magias, armadilhas, equipamentos, terreno nem efeitos de carta (mais de mil cartas do catálogo têm texto de efeito).
- Custo/teto não calibrado (acima). Sugestão: jogar partidas entre pessoas com o motor atrás de uma tela mínima e ajustar.
- Rede (sala, sinalização, reconexão, anti-trapaça) e tabuleiro (web e app) ainda não existem.
