'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';

const BlackjackPage = () => {
  const router = useRouter();

  const handleJoinTable = () => {
    router.push('/blackjack-table');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Blackjack</CardTitle>
          <CardDescription>Join a Blackjack table and play!</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={handleJoinTable}>Join Blackjack Table</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BlackjackPage;