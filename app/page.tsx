'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');

  const startGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    localStorage.setItem('playerName', name);
    router.push('/game');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-4">
      <div className="bg-slate-800/50 p-8 rounded-3xl shadow-2xl border border-slate-700 w-full max-w-md text-center backdrop-blur-sm">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          INU 벽돌깨기
        </h1>
        
        <div className="mb-8 relative flex justify-center">
          <div className="w-40 h-40 rounded-full bg-blue-500/20 flex items-center justify-center overflow-hidden shadow-lg border-2 border-blue-400/30">
            {/* If the mascot image is in public folder, we use it. Otherwise placeholder */}
            <img 
              src="/Mascot.jpg" 
              alt="횃불이 캐릭터" 
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=INU&background=random&size=200';
              }}
            />
          </div>
        </div>

        <form onSubmit={startGame} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="사용자 이름을 입력하세요"
            className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-slate-400 text-center text-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-lg shadow-lg transform transition active:scale-95"
          >
            게임 시작
          </button>
        </form>

        <div className="mt-12 text-sm text-slate-400 font-medium">
          <p>202500620</p>
          <p>경제학과</p>
          <p>박성민</p>
        </div>
      </div>
    </div>
  );
}
