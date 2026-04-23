'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BreakoutGame from '@/components/BreakoutGame';

export default function GamePage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState<string | null>(null);

  useEffect(() => {
    const name = localStorage.getItem('playerName');
    if (!name) {
      router.push('/');
    } else {
      setPlayerName(name);
    }
  }, [router]);

  if (!playerName) {
    return <div className="min-h-screen items-center justify-center bg-slate-900 flex text-white">Loading...</div>;
  }

  return (
      <div className="bg-slate-950 min-h-screen">
         <BreakoutGame playerName={playerName} />
      </div>
  );
}
