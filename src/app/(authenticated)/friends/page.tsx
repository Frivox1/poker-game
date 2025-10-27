'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth, db } from "@/lib/firebase";
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Friend {
  id: string;
  username: string;
  coins: number;
}

interface FriendRequest {
  id: string;
  from: string;
  fromUsername: string;
}

const FriendsPage = () => {
  const [username, setUsername] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    const fetchFriendsAndRequests = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        // Fetch friends
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const friendIds = userData.friends || [];
          if (friendIds.length > 0) {
            const friendPromises = friendIds.map((friendId: string) => getDoc(doc(db, "users", friendId)));
            const friendDocs = await Promise.all(friendPromises);
            const friendsData = friendDocs.map(doc => ({ id: doc.id, ...doc.data() } as Friend));
            setFriends(friendsData.filter(friend => friend.username));
          }
        }

        // Fetch friend requests
        const requestsQuery = query(collection(db, "friendRequests"), where("to", "==", currentUser.uid), where("status", "==", "pending"));
        const requestsSnapshot = await getDocs(requestsQuery);
        const requestsData = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FriendRequest));
        setFriendRequests(requestsData);
      }
    };

    fetchFriendsAndRequests();
  }, []);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));

    try {
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        toast.error("User not found");
        return;
      }

      const friendDoc = querySnapshot.docs[0];
      const friendId = friendDoc.id;
      const currentUser = auth.currentUser;

      if (currentUser && friendId !== currentUser.uid) {
        const currentUserDoc = await getDoc(doc(db, "users", currentUser.uid));
        const currentUserUsername = currentUserDoc.exists() ? currentUserDoc.data().username : "A user";

        await addDoc(collection(db, "friendRequests"), {
          from: currentUser.uid,
          fromUsername: currentUserUsername,
          to: friendId,
          status: "pending",
          createdAt: serverTimestamp(),
        });
        toast.success(`Friend request sent to ${username}`)
      } else {
        toast.error("You cannot send a friend request to yourself.");
      }
    } catch (error) {
      console.error("Error sending friend request: ", error);
      toast.error("Error sending friend request.");
    }

    setUsername("");
  };

  const handleRequestAction = async (requestId: string, action: 'accept' | 'decline') => {
    const requestDocRef = doc(db, "friendRequests", requestId);

    if (action === 'accept') {
      const requestDoc = await getDoc(requestDocRef);
      if (requestDoc.exists()) {
        const requestData = requestDoc.data();
        const fromId = requestData.from;
        const toId = requestData.to;

        // Add to friends lists
        const fromDocRef = doc(db, "users", fromId);
        const toDocRef = doc(db, "users", toId);
        await updateDoc(fromDocRef, { friends: arrayUnion(toId) });
        await updateDoc(toDocRef, { friends: arrayUnion(fromId) });

        // Delete the friend request document
        await deleteDoc(requestDocRef);

        toast.success("Friend request accepted!");

        // Add new friend to state
        const requestDocData = requestDoc.data();
        if (requestDocData) {
          const newFriend: Friend = { id: requestData.from, username: requestData.fromUsername, coins: requestData.fromCoins };
          setFriends((prevFriends) => [...prevFriends, newFriend]);
        }
      }
    } else {
      await deleteDoc(requestDocRef);
      toast.info("Friend request declined");
    }

    setFriendRequests(prev => prev.filter(req => req.id !== requestId));
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Add a Friend</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2" onSubmit={handleAddFriend}>
            <Input 
              placeholder="Enter username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="friends">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="friends">My Friends</TabsTrigger>
          <TabsTrigger value="requests">Friend Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="friends">
          <Card>
            <CardContent>
              {friends.length > 0 ? (
                <ul className="space-y-4">
                  {friends.map((friend) => (
                    <li key={friend.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={`https://api.dicebear.com/6.x/initials/svg?seed=${friend.username}`} />
                          <AvatarFallback>{friend.username.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{friend.username}</span>
                      </div>
                      <span className="text-muted-foreground">{friend.coins} coins</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted-foreground">You have no friends yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="requests">
          <Card>
            <CardContent className="pt-6">
              {friendRequests.length > 0 ? (
                <ul className="space-y-4">
                  {friendRequests.map((request) => (
                    <li key={request.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={`https://api.dicebear.com/6.x/initials/svg?seed=${request.fromUsername}`} />
                          <AvatarFallback>{request.fromUsername.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{request.fromUsername}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleRequestAction(request.id, 'accept')}>Accept</Button>
                        <Button size="sm" variant="outline" onClick={() => handleRequestAction(request.id, 'decline')}>Decline</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted-foreground">No new friend requests.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FriendsPage;
