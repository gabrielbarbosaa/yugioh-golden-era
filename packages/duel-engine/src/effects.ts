import type { EffectKey, MonsterEffectKey, SpellKey, TrapKey } from "./types.ts";

/** Magias, armadilhas e efeitos de monstros do modo, pelo NOME da carta no catálogo. */
export const SPELLS: Record<string, SpellKey> = {
  "Dark Hole": "darkHole",
  Raigeki: "raigeki",
  "Pot of Greed": "potOfGreed",
  "Monster Reborn": "monsterReborn",
  Fissure: "fissure",
  Ookazi: "ookazi",
  Hinotama: "hinotama",
  "Dian Keto the Cure Master": "dianKeto",
};

export const TRAPS: Record<string, TrapKey> = {
  "Mirror Force": "mirrorForce",
  "Magic Cylinder": "magicCylinder",
  "Negate Attack": "negateAttack",
};

export const MONSTER_EFFECTS: Record<string, MonsterEffectKey> = {
  "Man-Eater Bug": "manEaterBug",
  "Hane-Hane": "haneHane",
  "Magician of Faith": "magicianOfFaith",
  Kuriboh: "kuriboh",
};

/** Dano e cura fixos dos efeitos. */
export const OOKAZI_DAMAGE = 800;
export const HINOTAMA_DAMAGE = 500;
export const DIAN_KETO_HEAL = 1000;
export const POT_OF_GREED_DRAWS = 2;

/** Texto das regras de cada efeito (mostrado nas cartas). */
export const EFFECT_TEXT: Record<EffectKey, string> = {
  darkHole: "Destrói todos os monstros em campo (dos dois lados).",
  raigeki: "Destrói todos os monstros do oponente.",
  potOfGreed: "Compre 2 cartas.",
  monsterReborn: "Traz 1 monstro de qualquer cemitério para o seu campo, em ataque.",
  fissure: "Destrói o monstro virado para cima de menor ATK do oponente.",
  ookazi: "Causa 800 de dano ao oponente.",
  hinotama: "Causa 500 de dano ao oponente.",
  dianKeto: "Recupere 1000 pontos de vida.",
  mirrorForce: "Quando um monstro do oponente atacar: destrói todos os monstros dele em posição de ataque.",
  magicCylinder: "Quando um monstro do oponente atacar: anula o ataque e ele sofre dano igual ao ATK do atacante.",
  negateAttack: "Quando um monstro do oponente atacar: anula o ataque.",
  manEaterBug: "Quando virado para cima: destrói 1 monstro em campo à sua escolha.",
  haneHane: "Quando virado para cima: devolve 1 monstro em campo à mão do dono, à sua escolha.",
  magicianOfFaith: "Quando virado para cima: leva 1 magia do seu cemitério de volta à mão.",
  kuriboh: "Descarte da mão quando um monstro seu for atacado: anula o ataque.",
};

/** Armadilhas que respondem a um ataque. */
export const ATTACK_TRAPS: readonly TrapKey[] = ["mirrorForce", "magicCylinder", "negateAttack"];