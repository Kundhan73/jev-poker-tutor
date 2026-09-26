export const RANKS = "23456789TJQKA" as const;
export const SUITS = "shdc" as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/** Card encoded as 0..51: rankIndex * 4 + suitIndex. rankIndex 0 = deuce, 12 = ace. */
export type Card = number;

export const rankOf = (c: Card) => c >> 2;
export const suitOf = (c: Card) => c & 3;

export function cardFromString(s: string): Card {
  const r = RANKS.indexOf(s[0].toUpperCase() as Rank);
  const su = SUITS.indexOf(s[1].toLowerCase() as Suit);
  if (r < 0 || su < 0) throw new Error(`Bad card: ${s}`);
  return r * 4 + su;
}

export const cardToString = (c: Card) => RANKS[rankOf(c)] + SUITS[suitOf(c)];

export const cards = (s: string): Card[] =>
  s.trim().split(/\s+/).filter(Boolean).map(cardFromString);

export const fullDeck = (): Card[] => Array.from({ length: 52 }, (_, i) => i);

/** Uniform random int in [0, n). Uses crypto when available. */
export function randInt(n: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

export function shuffle<T>(arr: T[], rand: (n: number) => number = randInt): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const SUIT_SYMBOL: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
