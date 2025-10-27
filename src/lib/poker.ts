export interface Card {
  suit: string;
  rank: string;
}



export const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const suits = ["hearts", "diamonds", "clubs", "spades"];

export interface Player {
  id: string;
  username: string;
  coins: number;
  hand: Card[];
  currentBet: number;
  hasFolded: boolean;
  isAllIn: boolean;
}

export interface GameState {
  deck: Card[];
  communityCards: Card[];
  players: Player[];
  pot: number;
  currentRoundBet: number; // The amount to call for the current betting round
  minRaise: number; // Minimum amount to raise
  activePlayerIndex: number;
  dealerButtonIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  lastAggressiveActionPlayerIndex: number | null; // Tracks who made the last bet/raise
  smallBlindAmount: number;
  bigBlindAmount: number;
  phase: 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
  roundHistory: any[]; // To log actions for replay or debugging
  messages: string[]; // For game messages to players
}

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

export const initializeNewRound = (playersInRoom: {id: string, username: string, coins: number}[], dealerButtonIndex: number, smallBlindAmount: number, bigBlindAmount: number): GameState => {
  let deck = shuffleDeck(createDeck());
  const players = playersInRoom.map(p => ({
    ...p,
    hand: [],
    currentBet: 0,
    hasFolded: false,
    isAllIn: false,
  }));

  const numPlayers = players.length;
  dealerButtonIndex = (dealerButtonIndex + 1) % numPlayers;
  const smallBlindIndex = (dealerButtonIndex + 1) % numPlayers;
  const bigBlindIndex = (dealerButtonIndex + 2) % numPlayers;
  const activePlayerIndex = (bigBlindIndex + 1) % numPlayers; // Action starts left of big blind

  players[smallBlindIndex].coins -= smallBlindAmount;
  players[smallBlindIndex].currentBet = smallBlindAmount;

  players[bigBlindIndex].coins -= bigBlindAmount;
  players[bigBlindIndex].currentBet = bigBlindAmount;

  const gameStateWithBlinds = {
    deck,
    communityCards: [],
    players,
    pot: smallBlindAmount + bigBlindAmount,
    currentRoundBet: bigBlindAmount,
    minRaise: bigBlindAmount, // Initial min raise is big blind amount
    activePlayerIndex,
    dealerButtonIndex,
    smallBlindIndex,
    bigBlindIndex,
    smallBlindAmount,
    bigBlindAmount,
    lastAggressiveActionPlayerIndex: bigBlindIndex, // Big blind is the last aggressive action before pre-flop betting starts
    phase: 'pre-flop' as const,
    roundHistory: [],
    messages: ["New round started!"],
  };

  return dealHoleCards(gameStateWithBlinds);
};

export const dealHoleCards = (gameState: GameState): GameState => {
  let { deck, players } = gameState;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < players.length; j++) {
      if (players[j]) { // Ensure player exists
        const card = deck.pop();
        if (card) {
          players[j].hand.push(card);
        }
      }
    }
  }
  return { ...gameState, deck, players };
};

export const dealFlop = (gameState: GameState): GameState => {
  let { deck, communityCards } = gameState;
  deck.pop(); // Burn card
  communityCards.push(deck.pop()!, deck.pop()!, deck.pop()!);
  return { ...gameState, deck, communityCards, phase: 'flop' as const, currentRoundBet: 0, minRaise: gameState.bigBlindAmount };
};

export const dealTurn = (gameState: GameState): GameState => {
  let { deck, communityCards } = gameState;
  deck.pop(); // Burn card
  communityCards.push(deck.pop()!);
  return { ...gameState, deck, communityCards, phase: 'turn' as const, currentRoundBet: 0, minRaise: gameState.bigBlindAmount };
};

export const dealRiver = (gameState: GameState): GameState => {
  let { deck, communityCards } = gameState;
  deck.pop(); // Burn card
  communityCards.push(deck.pop()!);
  return { ...gameState, deck, communityCards, phase: 'river' as const, currentRoundBet: 0, minRaise: gameState.bigBlindAmount };
};

// --- Player Actions ---

export const handleFold = (gameState: GameState, playerId: string): GameState => {
  const playerIndex = gameState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || gameState.activePlayerIndex !== playerIndex) return gameState;

  gameState.players[playerIndex].hasFolded = true;
  gameState.messages.push(`${gameState.players[playerIndex].username} folds.`);
  return advanceToNextPlayer(gameState);
};

export const handleCall = (gameState: GameState, playerId: string): GameState => {
  const playerIndex = gameState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || gameState.activePlayerIndex !== playerIndex) return gameState;

  const player = gameState.players[playerIndex];
  const callAmount = gameState.currentRoundBet - player.currentBet;

  if (player.coins < callAmount) {
    gameState.pot += player.coins;
    player.currentBet += player.coins;
    player.coins = 0;
    player.isAllIn = true;
    gameState.messages.push(`${player.username} goes all-in for ${player.currentBet}.`);
  } else {
    player.coins -= callAmount;
    player.currentBet += callAmount;
    gameState.pot += callAmount;
    gameState.messages.push(`${player.username} calls ${callAmount}.`);
  }

  return advanceToNextPlayer(gameState);
};

export const handleBet = (gameState: GameState, playerId: string, amount: number): GameState => {
  const playerIndex = gameState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || gameState.activePlayerIndex !== playerIndex) return gameState;

  const player = gameState.players[playerIndex];
  if (amount < gameState.bigBlindAmount && gameState.phase === 'pre-flop' && player.currentBet === 0) {
    gameState.messages.push("Bet must be at least the big blind.");
    return gameState;
  }
  if (amount < gameState.minRaise && gameState.currentRoundBet > 0) {
    gameState.messages.push(`Bet must be at least the minimum raise of ${gameState.minRaise}.`);
    return gameState;
  }
  if (amount > player.coins) {
    gameState.messages.push("You don't have enough coins to make this bet.");
    return gameState;
  }

  const betIncrease = amount - player.currentBet;
  player.coins -= betIncrease;
  player.currentBet = amount;
  gameState.pot += betIncrease;
  
  // The new currentRoundBet is the amount of this bet
  gameState.currentRoundBet = amount;

  // The minimum raise for the next player is the difference between the new currentRoundBet and the previous one.
  // If this is the first bet of the round (after blinds), the minRaise is the big blind amount.
  const previousHighestBetInRound = Math.max(0, ...gameState.players.map(p => p.currentBet).filter((_, idx) => idx !== playerIndex));
  gameState.minRaise = Math.max(gameState.bigBlindAmount, amount - previousHighestBetInRound);

  gameState.messages.push(`${player.username} bets ${amount}.`);
  gameState.lastAggressiveActionPlayerIndex = playerIndex;
  return advanceToNextPlayer(gameState);
};


export const handleRaise = (gameState: GameState, playerId: string, amount: number): GameState => {
  const playerIndex = gameState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || gameState.activePlayerIndex !== playerIndex) return gameState;

  const player = gameState.players[playerIndex];
  const currentHighestBet = gameState.currentRoundBet;
  const minimumRaiseAmount = currentHighestBet + gameState.minRaise;
    
  if (amount < minimumRaiseAmount) {
    gameState.messages.push(`Raise must be at least ${gameState.minRaise} over the current bet of ${currentHighestBet}.`);
    return gameState;
  }
  if (amount > player.coins + player.currentBet) { // player.currentBet is already in the pot for this round
    gameState.messages.push("You don't have enough coins to make this raise.");
    return gameState;
  }

  const raiseAmount = amount - player.currentBet;
  player.coins -= raiseAmount;
  player.currentBet = amount;
  gameState.pot += raiseAmount;
  gameState.currentRoundBet = amount; // New highest bet
  gameState.minRaise = amount - currentHighestBet; // The new min raise is the amount of the raise itself

  gameState.messages.push(`${player.username} raises to ${amount}.`);
  gameState.lastAggressiveActionPlayerIndex = playerIndex;
  return advanceToNextPlayer(gameState);
};

export const handleCheck = (gameState: GameState, playerId: string): GameState => {
  const playerIndex = gameState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1 || gameState.activePlayerIndex !== playerIndex) return gameState;

  const player = gameState.players[playerIndex];
  // Player can only check if their current bet matches currentRoundBet (i.e. they've already matched or are big blind pre-flop)
  if (player.currentBet < gameState.currentRoundBet) {
    gameState.messages.push("You cannot check, you must call or raise.");
    return gameState;
  }

  gameState.messages.push(`${player.username} checks.`);
  return advanceToNextPlayer(gameState);
};

const advanceToNextPlayer = (gameState: GameState): GameState => {
  let nextActivePlayerIndex = gameState.activePlayerIndex;
  const numPlayers = gameState.players.length;
  let playersInHand = gameState.players.filter(p => !p.hasFolded);

  // Check if only one player remains in the hand
  if (playersInHand.length <= 1) {
    return determineWinner(gameState);
  }

  // Find the next player who needs to act
  let foundNextPlayer = false;
  for (let i = 0; i < numPlayers; i++) {
    nextActivePlayerIndex = (nextActivePlayerIndex + 1) % numPlayers;
    const player = gameState.players[nextActivePlayerIndex];

    // A player needs to act if they haven't folded, aren't all-in, and haven't matched the current bet
    if (!player.hasFolded && !player.isAllIn && player.currentBet < gameState.currentRoundBet) {
      foundNextPlayer = true;
      break;
    }
  }

  if (foundNextPlayer) {
    return { ...gameState, activePlayerIndex: nextActivePlayerIndex };
  } else {
    // No one else needs to act, so the betting round is over.
    // This happens if everyone has folded, gone all-in, or matched the current bet.
    return advancePhase(gameState);
  }
};

export const advancePhase = (gameState: GameState): GameState => {
  let nextGameState = { ...gameState, messages: [] as string[] };
  // Reset currentBet for all players for the new phase
  nextGameState.players = nextGameState.players.map(p => ({ ...p, currentBet: 0 }));

  if (nextGameState.phase === 'pre-flop') {
    nextGameState = dealFlop(nextGameState);
  } else if (nextGameState.phase === 'flop') {
    nextGameState = dealTurn(nextGameState);
  } else if (nextGameState.phase === 'turn') {
    nextGameState = dealRiver(nextGameState);
  } else if (nextGameState.phase === 'river') {
    nextGameState = determineWinner(nextGameState);
    nextGameState.phase = 'showdown' as const;
  }
  // Set new active player for the next phase (start from small blind, or next player after dealer)
  // Need to find the first *active* player after the dealer button
  let startPlayerIndex = (nextGameState.dealerButtonIndex + 1) % nextGameState.players.length;
  while(nextGameState.players[startPlayerIndex].hasFolded && nextGameState.players.filter(p => !p.hasFolded).length > 1) {
    startPlayerIndex = (startPlayerIndex + 1) % nextGameState.players.length;
  }
  nextGameState.activePlayerIndex = startPlayerIndex;
  nextGameState.currentRoundBet = 0; // Reset for new betting round
  nextGameState.minRaise = nextGameState.bigBlindAmount; // Reset min raise

  if (nextGameState.phase !== 'showdown' && nextGameState.phase !== 'ended') {
    nextGameState.messages.push(`--- ${nextGameState.phase.toUpperCase()} ---`);
  }
  return nextGameState;
};

export const determineWinner = (gameState: GameState): GameState => {
  const activePlayers = gameState.players.filter(p => !p.hasFolded);

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    winner.coins += gameState.pot;
    gameState.messages.push(`${winner.username} wins ${gameState.pot} coins (everyone else folded).`);
    return { ...gameState, phase: 'ended' as const, pot: 0 };
  }

  // Évaluer chaque main
  const hands = activePlayers.map(p => ({
    player: p,
    eval: evaluateHand(gameState.communityCards, p.hand),
  }));

  // Trouver la meilleure main
  hands.sort((a, b) => {
    if (a.eval.rankValue !== b.eval.rankValue) return b.eval.rankValue - a.eval.rankValue;
    // sinon, comparer les highCards
    for (let i = 0; i < Math.min(a.eval.highCards.length, b.eval.highCards.length); i++) {
      if (a.eval.highCards[i] !== b.eval.highCards[i])
        return b.eval.highCards[i] - a.eval.highCards[i];
    }
    return 0;
  });

  const best = hands[0];
  best.player.coins += gameState.pot;
  gameState.messages.push(`${best.player.username} wins ${gameState.pot} coins with ${best.eval.handRank}!`);
      return { ...gameState, phase: 'ended' as const, pot: 0 };};

// --- Poker Hand Evaluation Logic ---

type HandRank =
  | "High Card"
  | "One Pair"
  | "Two Pair"
  | "Three of a Kind"
  | "Straight"
  | "Flush"
  | "Full House"
  | "Four of a Kind"
  | "Straight Flush";

interface EvaluatedHand {
  handRank: HandRank;
  rankValue: number; // numerical for comparison
  highCards: number[]; // tiebreakers
}

// Helper maps
const rankToValue: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
  "7": 7, "8": 8, "9": 9, "10": 10, "J": 11,
  "Q": 12, "K": 13, "A": 14,
};

// --- Evaluate a 7-card hand (Texas Hold'em) ---
export const evaluateHand = (community: Card[], hand: Card[]): EvaluatedHand => {
  const all = [...community, ...hand];
  const values = all.map(c => rankToValue[c.rank]).sort((a, b) => b - a);
  const suitsCount: Record<string, Card[]> = {};
  const rankCount: Record<number, number> = {};

  // Count occurrences
  for (const card of all) {
    const val = rankToValue[card.rank];
    rankCount[val] = (rankCount[val] || 0) + 1;
    if (!suitsCount[card.suit]) suitsCount[card.suit] = [];
    suitsCount[card.suit].push(card);
  }

  const flushSuit = Object.keys(suitsCount).find(s => suitsCount[s].length >= 5);
  const flushCards = flushSuit ? suitsCount[flushSuit].map(c => rankToValue[c.rank]).sort((a,b)=>b-a) : [];

  // Straight detection (including wheel A-2-3-4-5)
  const uniqueVals = [...new Set(values)].sort((a,b)=>b-a);
  let straightHigh = 0;
  for (let i = 0; i <= uniqueVals.length - 5; i++) {
    if (uniqueVals[i] - uniqueVals[i + 4] === 4) {
      straightHigh = uniqueVals[i];
      break;
    }
  }
  if (!straightHigh && uniqueVals.includes(14) && uniqueVals.includes(5)) straightHigh = 5; // A-2-3-4-5

  // Straight flush
  if (flushCards.length >= 5) {
    const uniqueFlush = [...new Set(flushCards)];
    for (let i = 0; i <= uniqueFlush.length - 5; i++) {
      if (uniqueFlush[i] - uniqueFlush[i + 4] === 4) {
        return { handRank: "Straight Flush", rankValue: 8, highCards: [uniqueFlush[i]] };
      }
    }
    if (uniqueFlush.includes(14) && uniqueFlush.includes(5))
      return { handRank: "Straight Flush", rankValue: 8, highCards: [5] };
  }

  // Four of a Kind
  const quads = Object.keys(rankCount).filter(r => rankCount[+r] === 4).map(Number);
  if (quads.length > 0) {
    const kicker = uniqueVals.find(v => v !== quads[0])!;
    return { handRank: "Four of a Kind", rankValue: 7, highCards: [quads[0], kicker] };
  }

  // Full House
  const trips = Object.keys(rankCount).filter(r => rankCount[+r] === 3).map(Number).sort((a,b)=>b-a);
  const pairs = Object.keys(rankCount).filter(r => rankCount[+r] === 2).map(Number).sort((a,b)=>b-a);
  if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
    const fullHouseHigh = trips[0];
    const fullHouseLow = pairs[0] || trips[1];
    return { handRank: "Full House", rankValue: 6, highCards: [fullHouseHigh, fullHouseLow] };
  }

  // Flush
  if (flushCards.length >= 5) {
    return { handRank: "Flush", rankValue: 5, highCards: flushCards.slice(0,5) };
  }

  // Straight
  if (straightHigh) {
    return { handRank: "Straight", rankValue: 4, highCards: [straightHigh] };
  }

  // Three of a Kind
  if (trips.length > 0) {
    const kickers = uniqueVals.filter(v => v !== trips[0]).slice(0, 2);
    return { handRank: "Three of a Kind", rankValue: 3, highCards: [trips[0], ...kickers] };
  }

  // Two Pair
  if (pairs.length >= 2) {
    const kick = uniqueVals.find(v => v !== pairs[0] && v !== pairs[1])!;
    return { handRank: "Two Pair", rankValue: 2, highCards: [pairs[0], pairs[1], kick] };
  }

  // One Pair
  if (pairs.length === 1) {
    const kickers = uniqueVals.filter(v => v !== pairs[0]).slice(0, 3);
    return { handRank: "One Pair", rankValue: 1, highCards: [pairs[0], ...kickers] };
  }

  // High Card
  return { handRank: "High Card", rankValue: 0, highCards: values.slice(0, 5) };
};