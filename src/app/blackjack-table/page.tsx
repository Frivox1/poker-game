'use client';

import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';

interface Card {
  suit: string;
  rank: string;
  value: number;
}

const getDeck = (): Card[] => {
  const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      let value: number;
      if (rank === 'J' || rank === 'Q' || rank === 'K') {
        value = 10;
      } else if (rank === 'A') {
        value = 11; // Ace can be 1 or 11
      } else {
        value = parseInt(rank);
      }
      deck.push({ suit, rank, value });
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

const calculateHandValue = (hand: Card[]): number => {
  let value = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter(card => card.rank === 'A').length;

  while (value > 21 && aces > 0) {
    value -= 10; // Change Ace from 11 to 1
    aces--;
  }
  return value;
};

const CardComponent = ({ card, hidden }: { card: Card; hidden: boolean }) => {
  if (hidden) {
    return (
      <div className="w-32 h-48 bg-gray-500 rounded-md shadow-md flex items-center justify-center text-white text-lg font-bold">
      </div>
    );
  }

  const suitColor = (card.suit === 'Hearts' || card.suit === 'Diamonds') ? 'text-red-600' : 'text-black';

  return (
    <div className={`w-32 h-48 bg-white rounded-md shadow-md flex flex-col items-center justify-center ${suitColor}`}>
      <div className="text-3xl font-bold">{card.rank}</div>
      <div className="text-xl">{getSuitSymbol(card.suit)}</div>
    </div>
  );
};

const getSuitSymbol = (suit: string): string => {
  switch (suit) {
    case 'Hearts': return '♥';
    case 'Diamonds': return '♦';
    case 'Clubs': return '♣';
    case 'Spades': return '♠';
    default: return '';
  }
};

const BlackjackTablePage = () => {
  const router = useRouter();
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [dealerScore, setDealerScore] = useState(0);
  const [gameOver, setGameOver] = useState(true);
  const [message, setMessage] = useState('');
  const [userCoins, setUserCoins] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<number>(0);
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setUserCoins(userData.coins || 0);
          setUsername(userData.username || user.email?.split('@')[0]);
        }
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!gameOver) {
      if (playerScore > 21) {
        setMessage('Player busts! Dealer wins!');
        setGameOver(true);
      } else if (dealerScore > 21) {
        setMessage('Dealer busts! Player wins!');
        setGameOver(true);
      } else if (playerScore === 21 && playerHand.length === 2) {
        setMessage('Blackjack! Player wins!');
        setGameOver(true);
      } else if (dealerScore === 21 && dealerHand.length === 2) {
        setMessage('Blackjack! Dealer wins!');
        setGameOver(true);
      }
    }
  }, [playerHand, dealerHand, gameOver, playerScore, dealerScore]);

  const updateCoinsInFirestore = async (newCoins: number) => {
    if (userId) {
      const userDocRef = doc(db, "users", userId);
      await updateDoc(userDocRef, { coins: newCoins });
      setUserCoins(newCoins);
    }
  };

  const startGame = async () => {
    if (betAmount <= 0 || betAmount > userCoins) {
      setMessage('Please place a valid bet.');
      return;
    }

    const newDeck = shuffleDeck(getDeck());
    const newPlayerHand = [newDeck.pop()!, newDeck.pop()!];
    const newDealerHand = [newDeck.pop()!, newDeck.pop()!];

    setDeck(newDeck);
    setPlayerHand(newPlayerHand);
    setDealerHand(newDealerHand);
    setPlayerScore(calculateHandValue(newPlayerHand));
    setDealerScore(calculateHandValue(newDealerHand));
    setGameOver(false);
    setMessage('');

    // Deduct bet from coins
    await updateCoinsInFirestore(userCoins - betAmount);
  };

  const hit = async () => {
    if (gameOver) return;

    const newDeck = [...deck];
    const newPlayerHand = [...playerHand, newDeck.pop()!];
    const newPlayerScore = calculateHandValue(newPlayerHand);

    setDeck(newDeck);
    setPlayerHand(newPlayerHand);
    setPlayerScore(newPlayerScore);

    if (newPlayerScore > 21) {
      setMessage('Player busts! Dealer wins!');
      setGameOver(true);
    }
  };

  const stand = async () => {
    if (gameOver) return;

    let currentDealerHand = [...dealerHand];
    let currentDeck = [...deck];

    while (calculateHandValue(currentDealerHand) < 17) {
      currentDealerHand.push(currentDeck.pop()!);
    }

    setDealerHand(currentDealerHand);
    setDeck(currentDeck);
    const finalDealerScore = calculateHandValue(currentDealerHand);
    setDealerScore(finalDealerScore);
    setGameOver(true);

    const finalPlayerScore = calculateHandValue(playerHand);

    let finalMessage = '';
    let newCoins = userCoins;

    if (finalDealerScore > 21) {
      finalMessage = 'Dealer busts! Player wins!';
      newCoins += betAmount * 2; // Win original bet + betAmount
    } else if (finalPlayerScore > finalDealerScore) {
      finalMessage = 'Player wins!';
      newCoins += betAmount * 2; // Win original bet + betAmount
    } else if (finalDealerScore > finalPlayerScore) {
      finalMessage = 'Dealer wins!';
      // Bet already deducted
    } else {
      finalMessage = 'Push!';
      newCoins += betAmount; // Return original bet
    }
    setMessage(finalMessage);
    await updateCoinsInFirestore(newCoins);
  };

  const handleGoBack = () => {
    router.push('/menu');
  };

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 left-4 flex flex-col items-start gap-2">
        <Button onClick={handleGoBack} variant="outline">
          Go back to menu
        </Button>
        <div className="flex items-center gap-4">
          <p className="text-lg font-semibold">Player: {username}</p>
          <p className="text-lg font-semibold">Coins: {userCoins}</p>
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-gray-100 p-4 rounded-md shadow-md text-sm w-64">
        <h3 className="font-bold mb-2">Blackjack Rules:</h3>
        <ul className="list-disc list-inside">
          <li>Goal is to get as close to 21 as possible without going over.</li>
          <li>Aces are 1 or 11. Face cards are 10.</li>
          <li>Dealer hits until 17 or more.</li>
          <li>Blackjack (21 on first two cards) wins 1.5x your bet.</li>
          <li>Winning a regular hand wins 1x your bet.</li>
          <li>Push returns your bet.</li>
        </ul>
      </div>

      <h1 className="text-4xl font-bold mb-8">Blackjack</h1>

      <div className="flex flex-col items-center mb-8">
        <h2 className="text-2xl font-semibold">Dealer's Hand ({gameOver ? dealerScore : '??'})</h2>
        <div className="flex gap-2 mt-2">
          {dealerHand.map((card, index) => (
            <CardComponent key={index} card={card} hidden={!gameOver && index === 0} />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center mb-8">
        <h2 className="text-2xl font-semibold">Player's Hand ({playerScore})</h2>
        <div className="flex gap-2 mt-2">
          {playerHand.map((card, index) => (
            <CardComponent key={index} card={card} hidden={false} />
          ))}
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        {gameOver ? (
          <div className="flex flex-col items-center gap-4">
            <Input
              type="number"
              placeholder="Bet amount"
              value={betAmount === 0 ? '' : betAmount}
              onChange={(e) => setBetAmount(parseInt(e.target.value) || 0)}
              min="1"
              max={userCoins}
              className="w-40 text-center"
            />
            <Button onClick={startGame} disabled={betAmount <= 0 || betAmount > userCoins}>New Game</Button>
          </div>
        ) : (
          <>
            <Button onClick={hit}>Hit</Button>
            <Button onClick={stand}>Stand</Button>
          </>
        )}
      </div>

      {message && <p className="text-xl font-bold">{message}</p>}
    </div>
  );
};

export default BlackjackTablePage;