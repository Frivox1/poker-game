'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';

const LandingPage = () => {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-full max-w-2xl m-auto flex flex-col items-center text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Online Poker with Friends</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Create a private table, share the code with your friends and play poker online.
        </p>
        <Link href="/signup">
          <Button size="lg">Get Started</Button>
        </Link>
      </div>
    </div>
  );
};

export default LandingPage;
