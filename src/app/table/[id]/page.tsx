'use client';

import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const createDeck = (): Card[] => {
  const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const dealCards = (deck: Card[], numCards: number): Card[] => {
  const cards: Card[] = [];
  for (let i = 0; i < numCards; i++) {
    const card = deck.pop();
    if (card) {
      cards.push(card);
    }
  }
  return cards;
};

const getNextActivePlayerIndex = (currentPlayers: Player[], currentIndex: number): number => {
  let nextIndex = currentIndex;
  let count = 0;
  while (count < currentPlayers.length) {
    nextIndex = (nextIndex + 1) % currentPlayers.length;
    if (currentPlayers[nextIndex].status !== 'folded') {
      return nextIndex;
    }
    count++;
  }
  return currentIndex; // Should not happen if there's at least one active player
};

interface Card {
  suit: string;
  rank: string;
}

interface Player {
  id: string;
  username: string;
  chips: number;
  hand: Card[];
  status: 'active' | 'folded' | 'all-in';
  currentBet: number;
  hasActed: boolean;
  lastAction: string;
  chipsInPot: number;
}

const TablePage = () => {
  const router = useRouter();
  const { id: roomId } = useParams();
  const [players, setPlayers] = useState<Player[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [pot, setPot] = useState(0);
  const [dealerButton, setDealerButton] = useState(0);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [currentBet, setCurrentBet] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState('waiting'); // waiting, pre-flop, flop, turn, river, showdown
  const [lastRaise, setLastRaise] = useState(0);
  const [minBet, setMinBet] = useState(bigBlind);
  const [message, setMessage] = useState('');
  const [betAmount, setBetAmount] = useState(0);

  const currentPlayer = players.find(p => p.id === auth.currentUser?.uid);
  const isCurrentPlayerActive = currentPlayer && players[activePlayerIndex]?.id === currentPlayer.id;

  // Helper to update game state in Firestore
  const updateGameStateInFirestore = async (gameState: any) => {
    if (!roomId) return;
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomId", "==", roomId));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const roomDocRef = querySnapshot.docs[0].ref;
      await updateDoc(roomDocRef, gameState);
    }
  };

  const handleFold = async () => {
    if (!currentPlayer) return;

    const updatedPlayers = players.map((p) =>
      p.id === currentPlayer.id ? { ...p, status: 'folded', hasActed: true } : p
    );

    const nextActivePlayerIndex = getNextActivePlayerIndex(updatedPlayers, activePlayerIndex);

    setPlayers(updatedPlayers);
    setActivePlayerIndex(nextActivePlayerIndex);

    await updateGameStateInFirestore({
      players: updatedPlayers,
      activePlayerIndex: nextActivePlayerIndex,
    });
    await checkEndOfBettingRound(updatedPlayers, pot, nextActivePlayerIndex);
  };

  const handleCall = async () => {
    if (!currentPlayer || currentBet <= (currentPlayer.currentBet || 0)) {
      setMessage("Cannot call, no active bet or you've already matched it.");
      return;
    }

    const callAmount = currentBet - (currentPlayer.currentBet || 0);
    if (currentPlayer.chips < callAmount) {
      setMessage("Not enough chips to call.");
      return;
    }

    const updatedPlayers = players.map((p) =>
      p.id === currentPlayer.id
        ? {
            ...p,
            chips: p.chips - callAmount,
            chipsInPot: (p.chipsInPot || 0) + callAmount,
            currentBet: currentBet,
            hasActed: true,
          }
        : p
    );

    const newPot = pot + callAmount;
    const nextActivePlayerIndex = getNextActivePlayerIndex(updatedPlayers, activePlayerIndex);

    setPlayers(updatedPlayers);
    setPot(newPot);
    setActivePlayerIndex(nextActivePlayerIndex);

    await updateGameStateInFirestore({
      players: updatedPlayers,
      pot: newPot,
      activePlayerIndex: nextActivePlayerIndex,
    });
    await checkEndOfBettingRound(updatedPlayers, newPot, nextActivePlayerIndex);
  };

  const handleCheck = async () => {
    if (!currentPlayer || currentBet > (currentPlayer.currentBet || 0)) {
      setMessage("Cannot check, there's an active bet.");
      return;
    }

    const updatedPlayers = players.map((p) =>
      p.id === currentPlayer.id ? { ...p, hasActed: true } : p
    );

    const nextActivePlayerIndex = getNextActivePlayerIndex(updatedPlayers, activePlayerIndex);

    setPlayers(updatedPlayers);
    setActivePlayerIndex(nextActivePlayerIndex);

    await updateGameStateInFirestore({
      players: updatedPlayers,
      activePlayerIndex: nextActivePlayerIndex,
    });
    await checkEndOfBettingRound(updatedPlayers, pot, nextActivePlayerIndex);
  };

  const handleBetOrRaise = async () => {
    if (!currentPlayer) return;

    const currentPlayersBet = currentPlayer.currentBet || 0;
    const amountToMatch = currentBet - currentPlayersBet;
    const totalBet = betAmount; // This is the total amount the player wants to have in front of them

    if (totalBet < minBet) {
      setMessage(`Bet must be at least ${minBet}.`);
      return;
    }

    if (totalBet > currentPlayer.chips + currentPlayersBet) { // Player can't bet more than they have
      setMessage("You don't have enough chips for this bet.");
      return;
    }

    if (currentBet > 0 && totalBet <= currentBet) { // If raising, new bet must be higher than currentBet
      setMessage(`To raise, your total bet must be greater than the current bet of ${currentBet}.`);
      return;
    }

    const chipsToPutIn = totalBet - currentPlayersBet;

    const updatedPlayers = players.map((p) => {
      if (p.id === currentPlayer.id) {
        return {
          ...p,
          chips: p.chips - chipsToPutIn,
          chipsInPot: (p.chipsInPot || 0) + chipsToPutIn,
          currentBet: totalBet,
          hasActed: true,
        };
      } else if (p.status !== 'folded') {
        // Reset hasActed for other players who haven't folded, so they can act again
        return { ...p, hasActed: false };
      }
      return p;
    });

    const newPot = pot + chipsToPutIn;
    const newCurrentBet = totalBet;
    const newLastRaise = totalBet - currentBet; // The amount of the raise itself
    const newMinBet = newCurrentBet + newLastRaise; // Min bet for next raise

    const nextActivePlayerIndex = getNextActivePlayerIndex(updatedPlayers, activePlayerIndex);

    setPlayers(updatedPlayers);
    setPot(newPot);
    setCurrentBet(newCurrentBet);
    setLastRaise(newLastRaise);
    setMinBet(newMinBet);
    setActivePlayerIndex(nextActivePlayerIndex);
    setBetAmount(0); // Reset bet amount input

    await updateGameStateInFirestore({
      players: updatedPlayers,
      pot: newPot,
      currentBet: newCurrentBet,
      lastRaise: newLastRaise,
      minBet: newMinBet,
      activePlayerIndex: nextActivePlayerIndex,
    });
    await checkEndOfBettingRound(updatedPlayers, newPot, nextActivePlayerIndex);
  };

  const checkEndOfBettingRound = async (currentPlayers: Player[], currentPot: number, currentActivePlayerIndex: number) => {
    const activePlayers = currentPlayers.filter(p => p.status !== 'folded');

    const allPlayersActed = activePlayers.every(p => p.hasActed);
    const allBetsMatched = activePlayers.every(p => p.currentBet === currentBet || p.status === 'folded');

    if (allPlayersActed && allBetsMatched) {
      // Betting round is over, advance game phase
      let newGamePhase = gamePhase;
      let newCommunityCards = [...communityCards];
      let newDeck = [...deck];

      // Reset for next betting round
      const resetPlayers = currentPlayers.map(p => ({ ...p, hasActed: false, currentBet: 0 }));
      const newCurrentBet = 0;
      const newLastRaise = 0;
      const newMinBet = bigBlind;

      if (gamePhase === 'pre-flop') {
        newGamePhase = 'flop';
        newCommunityCards = [...newCommunityCards, ...dealCards(newDeck, 3)];
      } else if (gamePhase === 'flop') {
        newGamePhase = 'turn';
        newCommunityCards = [...newCommunityCards, ...dealCards(newDeck, 1)];
      } else if (gamePhase === 'turn') {
        newGamePhase = 'river';
        newCommunityCards = [...newCommunityCards, ...dealCards(newDeck, 1)];
      } else if (gamePhase === 'river') {
        newGamePhase = 'showdown';
        // TODO: Implement showdown logic
      }

      setPlayers(resetPlayers);
      setCurrentBet(newCurrentBet);
      setLastRaise(newLastRaise);
      setMinBet(newMinBet);
      setGamePhase(newGamePhase);
      setCommunityCards(newCommunityCards);
      setDeck(newDeck); // Update deck after dealing

      await updateGameStateInFirestore({
        players: resetPlayers,
        currentBet: newCurrentBet,
        lastRaise: newLastRaise,
        minBet: newMinBet,
        gamePhase: newGamePhase,
        communityCards: newCommunityCards,
        deck: newDeck,
      });
    }
  };

  const startGame = async () => {
    if (players.length < 2 || players.length > 7) {
      setMessage("Need 2-7 players to start the game.");
      return;
    }

    let newDeck = shuffleDeck(createDeck());
    const newPlayers = players.map(player => ({
      ...player,
      hand: dealCards(newDeck, 2),
      status: 'active',
      currentBet: 0,
      hasActed: false,
      chipsInPot: 0,
    }));

    // Determine dealer, small blind, big blind
    const newDealerButton = (dealerButton + 1) % newPlayers.length;
    const sbIndex = (newDealerButton + 1) % newPlayers.length;
    const bbIndex = (newDealerButton + 2) % newPlayers.length;

    newPlayers[sbIndex].chips -= smallBlind;
    newPlayers[sbIndex].chipsInPot = smallBlind;
    newPlayers[sbIndex].currentBet = smallBlind;

    newPlayers[bbIndex].chips -= bigBlind;
    newPlayers[bbIndex].chipsInPot = bigBlind;
    newPlayers[bbIndex].currentBet = bigBlind;

    const newPot = smallBlind + bigBlind;
    const newCurrentBet = bigBlind;
    const newActivePlayerIndex = (bbIndex + 1) % newPlayers.length;

    setDeck(newDeck);
    setPlayers(newPlayers);
    setPot(newPot);
    setDealerButton(newDealerButton);
    setCurrentBet(newCurrentBet);
    setActivePlayerIndex(newActivePlayerIndex);
    setGamePhase('pre-flop');
    setMessage('');

    await updateGameStateInFirestore({
      deck: newDeck,
      players: newPlayers,
      communityCards: [],
      pot: newPot,
      dealerButton: newDealerButton,
      currentBet: newCurrentBet,
      activePlayerIndex: newActivePlayerIndex,
      gamePhase: 'pre-flop',
      lastRaise: 0,
      minBet: bigBlind,
      message: '',
    });
  };

  useEffect(() => {
    console.log("useEffect running, roomId:", roomId);
    if (!roomId) return;

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomId", "==", roomId));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (querySnapshot.empty) {
        console.log("Room not found or has been deleted.");
        router.push("/menu");
        return;
      }

      const roomDoc = querySnapshot.docs[0];
      const roomData = roomDoc.data();
      const playersFromFirestore = roomData.players || [];

      // Update local state from Firestore
      setDeck(roomData.deck || []);
      setCommunityCards(roomData.communityCards || []);
      setPot(roomData.pot || 0);
      setDealerButton(roomData.dealerButton || 0);
      setSmallBlind(roomData.smallBlind || 10);
      setBigBlind(roomData.bigBlind || 20);
      setCurrentBet(roomData.currentBet || 0);
      setActivePlayerIndex(roomData.activePlayerIndex || 0);
      setGamePhase(roomData.gamePhase || 'waiting');
      setLastRaise(roomData.lastRaise || 0);
      setMinBet(roomData.minBet || bigBlind);
      setMinBet(roomData.minBet || bigBlind);
      setMessage(roomData.message || '');

      const playerIds = roomData.players || [];

      if (playerIds.length > 0) {
        // Check if the first element is a string (UID) or an object (Player)
        if (typeof playerIds[0] === 'string') {
          // It's an array of UIDs, so fetch user data
          const playerPromises = playerIds.map((pId: string) => getDoc(doc(db, "users", pId)));
          Promise.all(playerPromises).then((playerDocs) => {
            const playersData = playerDocs
              .filter(doc => doc.exists())
              .map(doc => ({
                id: doc.id,
                username: doc.data()?.username,
                chips: doc.data()?.coins,
                hand: [], // Initial hand, will be updated by startGame
                status: 'active',
                currentBet: 0,
                hasActed: false,
                chipsInPot: 0,
              } as Player));
            setPlayers(playersData);
          });
        } else {
          // It's an array of Player objects, use them directly
          const validPlayers = playerIds.filter((p: any) => p && p.id) as Player[];
          setPlayers(validPlayers);
        }
      } else {
        setPlayers([]);
      }
    });

    return () => unsubscribe();
  }, [roomId, router]);

  const handleLeaveRoom = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !roomId) return;

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomId", "==", roomId));

    try {
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        router.push("/menu");
        return;
      }

      const roomDoc = querySnapshot.docs[0];
      const roomDocRef = roomDoc.ref;
      const roomData = roomDoc.data();
      const players = roomData.players || [];

      const updatedPlayers = players.filter((pId: string) => pId !== currentUser.uid);

      if (updatedPlayers.length === 0) {
        await deleteDoc(roomDocRef);
      } else {
        await updateDoc(roomDocRef, { players: updatedPlayers });
      }

      router.push("/menu");

    } catch (error) {
      console.error("Error leaving room: ", error);
    }
  };

  const getPlayerPosition = (index: number, totalPlayers: number) => {
    const angle = (index / totalPlayers) * 2 * Math.PI;
    const radius = 60; // Position players outside the ellipse
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { left: `${x}%`, top: `${y}%` };
  };

  return (
    <div className="w-screen h-screen bg-white text-black p-4 flex flex-col">
      <header className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={handleLeaveRoom}>Go back to menu</Button>
        <div className="text-2xl font-bold">Room: {roomId}</div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center">
        <div className="relative w-[700px] h-[300px] bg-transparent rounded-full border-2 border-black">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            <div className="mb-4 text-xl font-semibold">Pot: {pot}</div>

            <div className="flex flex-col items-center">
              <h2 className="text-2xl font-semibold">Community Cards</h2>
              <div className="flex gap-2 mt-2">
                {communityCards.length > 0 ? (
                  communityCards.map((card, index) => (
                    <div key={index} className="border p-2 rounded bg-white text-black">
                      {`${card.rank} ${card.suit}`}
                    </div>
                  ))
                ) : (
                  <p>No community cards yet.</p>
                )}
              </div>
            </div>
          </div>
          {players.map((player, index) => {
            const position = getPlayerPosition(index, players.length);
            const isCurrentUser = auth.currentUser?.uid === player.id;
            return (
              <div key={player.id} className="absolute transform -translate-x-1/2 -translate-y-1/2" style={position}>
                <div className="flex flex-col items-center">
                  <Avatar>
                    <AvatarImage src={`https://api.dicebear.com/6.x/initials/svg?seed=${player.username}`} />
                    <AvatarFallback>{player.username.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-bold mt-1">{player.username}</span>
                  <span className="text-gray-600">Chips: {player.chips}</span>
                  {isCurrentUser && player.hand.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {player.hand.map((card, cardIndex) => (
                        <div key={cardIndex} className="border p-1 rounded bg-white text-black text-xs">
                          {`${card.rank} ${card.suit}`}
                        </div>
                      ))}
                    </div>
                  )}
                  {!isCurrentUser && player.hand.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      <div className="border p-1 rounded bg-gray-500 text-white text-xs">?</div>
                      <div className="border p-1 rounded bg-gray-500 text-white text-xs">?</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <footer className="flex justify-center mt-4">
        {gamePhase === 'waiting' && (
          <Button onClick={startGame}>Start Game</Button>
        )}

        {gamePhase !== 'waiting' && currentPlayer && isCurrentPlayerActive && (
          <div className="flex gap-2">
            <Button onClick={handleFold}>Fold</Button>
            {currentBet > (currentPlayer.currentBet || 0) ? (
              <Button onClick={handleCall}>Call ({currentBet - (currentPlayer.currentBet || 0)})</Button>
            ) : (
              <Button onClick={handleCheck}>Check</Button>
            )}
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              className="border p-2 rounded w-24"
              min={minBet}
              max={currentPlayer.chips}
            />
            <Button onClick={handleBetOrRaise}>
              {currentBet === 0 ? 'Bet' : 'Raise'}
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default TablePage;
