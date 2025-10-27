'use client';

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, LogIn as LogInIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addDoc, collection, serverTimestamp, getDocs, query, where, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const MenuPage = () => {
  const router = useRouter();
  const [roomIdInput, setRoomIdInput] = useState("");

  const handleCreateTable = async () => {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    const currentUser = auth.currentUser;

    if (currentUser) {
      await addDoc(collection(db, 'rooms'), {
        roomId,
        players: [currentUser.uid],
        createdAt: serverTimestamp(),
        host: currentUser.uid,
      });
      router.push(`/table/${roomId}`);
    }
  };

  const handleJoinTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput) return;

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("roomId", "==", roomIdInput));

    try {
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        toast.error("Room not found");
        return;
      }

      const roomDoc = querySnapshot.docs[0];
      const roomDocRef = roomDoc.ref;
      const currentUser = auth.currentUser;

      if (currentUser) {
        await updateDoc(roomDocRef, {
          players: arrayUnion(currentUser.uid)
        });
        router.push(`/table/${roomIdInput}`);
      }

    } catch (error) {
      console.error("Error joining room: ", error);
      toast.error("Error joining room.");
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleCreateTable}>
            <CardHeader className="flex flex-col items-center justify-center text-center p-12">
                <Plus className="h-16 w-16 text-primary mb-4" />
                <CardTitle className="text-2xl">Create a Table</CardTitle>
                <CardDescription>Start a new game with your friends</CardDescription>
            </CardHeader>
        </Card>
        <Dialog>
          <DialogTrigger asChild>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="flex flex-col items-center justify-center text-center p-12">
                    <LogInIcon className="h-16 w-16 text-primary mb-4" />
                    <CardTitle className="text-2xl">Join a Table</CardTitle>
                    <CardDescription>Enter a code to join an existing game</CardDescription>
                </CardHeader>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join a Table</DialogTitle>
              <DialogDescription>
                Enter the 6-digit room ID to join a game.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleJoinTable}>
              <Input 
                placeholder="Room ID"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                className="my-4"
              />
              <DialogFooter>
                <Button type="submit">Join Table</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
    </div>
  );
};

export default MenuPage;