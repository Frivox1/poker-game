'use client';

import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Player {
  id: string;
  username: string;
  coins: number;
}

const TablePage = () => {
  const router = useRouter();
  const { id: roomId } = useParams();
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
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
      const playerIds = roomData.players || [];

      if (playerIds.length > 0) {
        const playerPromises = playerIds.map((pId: string) => getDoc(doc(db, "users", pId)));
        Promise.all(playerPromises).then((playerDocs) => {
          const playersData = playerDocs
            .filter(doc => doc.exists())
            .map(doc => ({ id: doc.id, ...doc.data() } as Player));
          setPlayers(playersData);
        });
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
      <main className="flex-1 flex items-center justify-center">
        <div className="relative w-[700px] h-[300px] bg-transparent rounded-full border-2 border-black">
          {players.map((player, index) => {
            const position = getPlayerPosition(index, players.length);
            return (
              <div key={player.id} className="absolute transform -translate-x-1/2 -translate-y-1/2" style={position}>
                <div className="flex flex-col items-center">
                  <Avatar>
                    <AvatarImage src={`https://api.dicebear.com/6.x/initials/svg?seed=${player.username}`} />
                    <AvatarFallback>{player.username.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-bold mt-1">{player.username}</span>
                  <span className="text-gray-600">{player.coins} coins</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default TablePage;
