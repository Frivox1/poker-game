'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dummyLeaderboardData = [
  { rank: 1, username: "PlayerOne", score: 1500 },
  { rank: 2, username: "PlayerTwo", score: 1200 },
  { rank: 3, username: "PlayerThree", score: 1000 },
  { rank: 4, username: "PlayerFour", score: 800 },
  { rank: 5, username: "PlayerFive", score: 750 },
];

const LeaderboardPage = () => {
  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">Leaderboard</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Rank</TableHead>
            <TableHead>Username</TableHead>
            <TableHead className="text-right">Coins</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dummyLeaderboardData.map((player) => (
            <TableRow key={player.rank}>
              <TableCell className="font-medium">{player.rank}</TableCell>
              <TableCell>{player.username}</TableCell>
              <TableCell className="text-right">{player.score}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default LeaderboardPage;