# Relatório de equilíbrio (N=300 por linha, semente 1)

Catálogo: 1085 monstros de baralho, 69 fusões, 66 receitas.

## Custos

- Custo de uma carta: mín 2, mediana 8, p90 12, máx 21, média 8.1.
- Baralho aleatório sem teto: custo médio ~326. Baralho "mais forte" sem teto: 688.

## 1. Sanidade do jogo (baralhos aleatórios, sem teto)

| Confronto | A vence | B vence | Empates | 1º jogador vence | Turnos (média) | Com fusão | Fim por vida / baralho / limite |
|---|---|---|---|---|---|---|---|
| esperto x esperto | 46.0% | 44.3% | 9.7% | 45.8% | 28.6 | 0.0% | 232 / 39 / 29 |
| esperto (A) x aleatório (B) | 93.0% | 7.0% | 0.0% | 50.3% | 15.2 | 0.3% | 300 / 0 / 0 |

## 2. Todos contra todos: cinco estilos de baralho sob o mesmo teto de custo

Cada par joga N partidas (alternando quem começa) com o bot esperto dos dois lados. Estilos: **Poder** (maior ATK), **Curva plana** (só cartas que cabem no custo médio do teto), **Muralha** (maior DEF), **Fusão** (4 receitas + resto aleatório) e **Aleatório**.
Um teto equilibrado deixa todos os estilos perto de 50%; um estilo muito acima dos demais domina o jogo. (Sem teto, a Curva plana é só a metade mais fraca do catálogo e não é comparável.)

### Teto sem teto

| Estilo | Custo do baralho | Vitórias | Derrotas | Empates | Taxa de vitória |
|---|---|---|---|---|---|
| Poder | 685 | 497 | 51 | 52 | 82.8% |
| Curva plana | 320 | 3 | 555 | 42 | 0.5% |
| Muralha | 656 | 501 | 48 | 51 | 83.5% |
| Fusão | 340 | 199 | 373 | 28 | 33.2% |
| Aleatório | 333 | 201 | 374 | 25 | 33.5% |

### Teto 500

| Estilo | Custo do baralho | Vitórias | Derrotas | Empates | Taxa de vitória |
|---|---|---|---|---|---|
| Poder | 500 | 495 | 47 | 58 | 82.5% |
| Curva plana | 474 | 205 | 376 | 19 | 34.2% |
| Muralha | 500 | 496 | 46 | 58 | 82.7% |
| Fusão | 340 | 106 | 478 | 16 | 17.7% |
| Aleatório | 333 | 116 | 471 | 13 | 19.3% |

### Teto 420

| Estilo | Custo do baralho | Vitórias | Derrotas | Empates | Taxa de vitória |
|---|---|---|---|---|---|
| Poder | 420 | 498 | 44 | 58 | 83.0% |
| Curva plana | 384 | 109 | 462 | 29 | 18.2% |
| Muralha | 420 | 493 | 50 | 57 | 82.2% |
| Fusão | 340 | 154 | 428 | 18 | 25.7% |
| Aleatório | 333 | 154 | 424 | 22 | 25.7% |

### Teto 360

| Estilo | Custo do baralho | Vitórias | Derrotas | Empates | Taxa de vitória |
|---|---|---|---|---|---|
| Poder | 360 | 497 | 39 | 64 | 82.8% |
| Curva plana | 360 | 70 | 502 | 28 | 11.7% |
| Muralha | 360 | 484 | 53 | 63 | 80.7% |
| Fusão | 340 | 165 | 412 | 23 | 27.5% |
| Aleatório | 333 | 181 | 391 | 28 | 30.2% |

### Teto 320

| Estilo | Custo do baralho | Vitórias | Derrotas | Empates | Taxa de vitória |
|---|---|---|---|---|---|
| Poder | 320 | 507 | 35 | 58 | 84.5% |
| Curva plana | 320 | 10 | 547 | 43 | 1.7% |
| Muralha | 320 | 468 | 72 | 60 | 78.0% |
| Fusão | 320 | 195 | 372 | 33 | 32.5% |
| Aleatório | 320 | 204 | 358 | 38 | 34.0% |

### Resumo: diferença entre o melhor e o pior estilo, por teto

| Teto | Melhor − pior (pontos percentuais) |
|---|---|
| sem teto | 83.0 |
| 500 | 65.0 |
| 420 | 64.8 |
| 360 | 71.2 |
| 320 | 82.8 |

## 3. Modelos de custo (comparação)

O custo atual (modelo 1) é linear no nível e no ATK/DEF. Abaixo, modelos mais **convexos** (o poder alto fica proporcionalmente mais caro) e três tetos por modelo, escolhidos como 40 x o custo de uma carta no percentil indicado.
O que se procura: os estilos otimizados (Poder, Curva plana, Muralha) perto uns dos outros, sem um deles dominar.

| Modelo | Percentil | Teto | Poder | Curva plana | Muralha | Fusão | Aleatório | Spread otimizados (pp) |
|---|---|---|---|---|---|---|---|---|
| 1 linear (atual) | p50 | 320 | 85% | 2% | 78% | 33% | 34% | 82.8 |
| 1 linear (atual) | p65 | 360 | 83% | 12% | 81% | 28% | 30% | 71.2 |
| 1 linear (atual) | p80 | 400 | 83% | 18% | 81% | 26% | 26% | 65.0 |
| 2 convexo p=1.6 | p50 | 360 | 74% | 4% | 85% | 38% | 38% | 81.2 |
| 2 convexo p=1.6 | p65 | 440 | 77% | 5% | 86% | 32% | 31% | 80.8 |
| 2 convexo p=1.6 | p80 | 560 | 81% | 15% | 81% | 27% | 29% | 65.7 |
| 3 convexo p=2.0 | p50 | 400 | 70% | 12% | 78% | 41% | 38% | 66.2 |
| 3 convexo p=2.0 | p65 | 520 | 71% | 8% | 83% | 37% | 42% | 74.7 |
| 3 convexo p=2.0 | p80 | 720 | 76% | 16% | 88% | 30% | 32% | 72.0 |
| 4 só estatística (max/250) | p50 | 240 | 85% | 1% | 78% | 34% | 38% | 83.5 |
| 4 só estatística (max/250) | p65 | 280 | 83% | 7% | 81% | 30% | 30% | 76.8 |
| 4 só estatística (max/250) | p80 | 320 | 83% | 17% | 82% | 26% | 27% | 65.7 |
| 5 ATK + DEF/2 (÷300) | p50 | 280 | 84% | 5% | 80% | 28% | 34% | 79.3 |
| 5 ATK + DEF/2 (÷300) | p65 | 320 | 83% | 12% | 81% | 29% | 30% | 71.8 |
| 5 ATK + DEF/2 (÷300) | p80 | 360 | 82% | 18% | 83% | 26% | 27% | 65.3 |

## 4. Limite de cartas de elite (ATK ou DEF >= 2500) por baralho, sem teto de custo

Cartas de elite no catálogo: 74 de 1085. Cada linha limita quantas delas cabem no baralho.

| Máx. elite | Poder | Curva plana | Muralha | Fusão | Aleatório | Spread otimizados (pp) |
|---|---|---|---|---|---|---|
| sem limite | 83% | 1% | 84% | 33% | 34% | 83.0 |
| 12 | 84% | 1% | 79% | 33% | 34% | 83.7 |
| 6 | 83% | 1% | 89% | 33% | 34% | 88.3 |
| 3 | 92% | 1% | 73% | 35% | 35% | 91.8 |
| 0 | 98% | 2% | 64% | 33% | 30% | 96.7 |

