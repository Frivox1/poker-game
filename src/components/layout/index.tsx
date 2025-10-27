'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Home, Users, BarChart, LogOut } from 'lucide-react';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { ThemeToggle } from "@/components/ui/theme-toggle";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export const Layout = ({ children, title }: LayoutProps) => {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    const storedCoins = localStorage.getItem('coins');

    if (storedUsername && storedCoins) {
      setDisplayName(storedUsername);
      setCoins(Number(storedCoins));
    } else {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          console.log('Fetching user data from Firestore...');
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setDisplayName(userData.username);
            setCoins(userData.coins);
            localStorage.setItem('username', userData.username);
            localStorage.setItem('coins', String(userData.coins));
          } else {
            router.push('/login');
          }
        } else {
          router.push('/login');
        }
      });
      return () => unsubscribe();
    }
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    localStorage.removeItem('username');
    localStorage.removeItem('coins');
    router.push('/login');
  };

  const navLinks = [
    { href: '/menu', label: 'Home', icon: Home },
    { href: '/friends', label: 'Friends', icon: Users },
    { href: '/leaderboard', label: 'Leaderboard', icon: BarChart },
  ];

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-[60px] items-center px-6">
            <Link className="flex items-center gap-2 font-semibold" href="#">
              <span>Poker Game</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto py-2">
            <nav className="grid items-start px-4 text-sm font-medium">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                  href={link.href}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="mt-auto p-4">
            <div className="flex items-center gap-2 mb-4 w-full">
              <div>
              <span className="text-lg font-medium">{displayName}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-gray-500">Coins:</span>
              <span className="text-sm font-medium">{coins}</span>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="w-full">
              <LogOut className="mr-2 h-4 w-4" /> Log Out
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
            <Link className="lg:hidden" href="#">
                <span className="sr-only">Home</span>
            </Link>
            <div className="w-full flex-1">
                <h1 className="text-lg font-semibold">{title}</h1>
            </div>
            <ThemeToggle />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 items-center justify-center">
            {children}
        </main>
      </div>
    </div>
  );
};
