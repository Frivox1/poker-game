
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffledDeck = [...deck];
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
  }
  return shuffledDeck;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  bet: number;
  hand: Card[];
  isFolded: boolean;
  isAllIn: boolean;
}

export type GameStage = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GameState {
  players: Player[];
  deck: Card[];
  communityCards: Card[];
  pot: number;
  currentPlayerIndex: number;
  currentBet: number;
  stage: GameStage;
  smallBlind: number;
  bigBlind: number;
}

export function createGameState(players: { id: string; name: string; }[], smallBlind: number, bigBlind: number): GameState {
  const gamePlayers: Player[] = players.map(p => ({
    id: p.id,
    name: p.name,
    chips: 1000, // Starting chips
    bet: 0,
    hand: [],
    isFolded: false,
    isAllIn: false,
  }));

  const deck = shuffleDeck(createDeck());

  // Deal two cards to each player
  for (let i = 0; i < 2; i++) {
    for (const player of gamePlayers) {
      player.hand.push(deck.pop()!);
    }
  }

  return {
    players: gamePlayers,
    deck,
    communityCards: [],
    pot: 0,
    currentPlayerIndex: 0,
    currentBet: 0,
    stage: 'pre-flop',
    smallBlind,
    bigBlind,
  };
}
