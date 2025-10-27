import React from 'react';
import { Card as UICard } from "@/components/ui/card"; // Renamed to avoid conflict with poker Card interface

interface CardProps {
  suit?: string;
  rank?: string;
  back?: boolean;
  small?: boolean;
}

export const Card = ({ suit, rank, back, small }: CardProps) => {
  const cardWidth = small ? "w-12" : "w-20";
  const cardHeight = small ? "h-16" : "h-28";
  const textSize = small ? "text-sm" : "text-lg";

  if (back) {
    return (
      <UICard className={`${cardWidth} ${cardHeight} flex items-center justify-center bg-blue-800 rounded-md shadow-md`}>
        <span className="text-white text-2xl font-bold">🃏</span>
      </UICard>
    );
  }

  if (!suit || !rank) {
    return (
      <UICard className={`${cardWidth} ${cardHeight} flex items-center justify-center bg-gray-200 rounded-md shadow-md`}>
        <span className="text-gray-500 ${textSize}">?</span>
      </UICard>
    );
  }

  const isRed = suit === "hearts" || suit === "diamonds";
  const textColor = isRed ? "text-red-600" : "text-black";

  const getSuitSymbol = (s: string) => {
    switch (s) {
      case "hearts":
        return "♥";
      case "diamonds":
        return "♦";
      case "clubs":
        return "♣";
      case "spades":
        return "♠";
      default:
        return "";
    }
  };

  return (
    <UICard className={`${cardWidth} ${cardHeight} bg-white rounded-md shadow-md flex flex-col justify-between p-1 ${textColor}`}>
      <div className={`font-bold ${textSize}`}>{rank}</div>
      <div className={`text-center text-2xl ${textColor}`}>{getSuitSymbol(suit)}</div>
      <div className={`font-bold ${textSize} self-end transform rotate-180`}>{rank}</div>
    </UICard>
  );
};