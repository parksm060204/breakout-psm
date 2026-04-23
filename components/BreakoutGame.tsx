'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { Pause, Play, RotateCcw, XSquare, Trophy, Heart } from 'lucide-react';

const COLORS = [
  '#ff9999', // Light Red
  '#ffcc99', // Light Orange
  '#ffff99', // Light Yellow
  '#99ccff', // Light Blue
  '#99ff99', // Light Green
  '#cc99ff', // Light Purple
];
const LIGHT_RED = '#ff9999';

interface BaseProps {
  playerName: string;
}

export default function BreakoutGame({ playerName }: BaseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [gameState, setGameState] = useState<'countdown' | 'playing' | 'paused' | 'failed' | 'success'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [lives, setLives] = useState(3);
  const [time, setTime] = useState(0); // in seconds
  const [redDestroyed, setRedDestroyed] = useState(0);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(()=>{});
    }
    return audioCtxRef.current;
  };

  // References for game loop mutable state
  const stateRef = useRef({
    lives: 3,
    time: 0,
    redDestroyed: 0,
    gameState: 'countdown' as 'countdown' | 'playing' | 'paused' | 'failed' | 'success',
  });

  // Game Engine State
  const engine = useRef({
    ball: { x: 0, y: 0, dx: 0, dy: 0, radius: 6 },
    paddle: { x: 0, y: 0, w: 80, h: 12, speed: 7 },
    bricks: [] as { x: number, y: number, status: number, color: string }[][],
    keys: { ArrowLeft: false, ArrowRight: false },
    touchX: null as number | null,
    isInitialized: false,
    width: 0,
    height: 0,
    redDestroyedCount: 0,
    scale: 1,
    isMobile: false,
  });

  const playHitSound = () => {
    try {
      const ctx = getAudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.1);
    } catch(e) {}
  };

  const playWallSound = () => {
    try {
      const ctx = getAudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(150, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.1);
    } catch(e) {}
  };

  const initBricks = () => {
    const rows = 5;
    const cols = 8;
    const totalBricks = rows * cols;
    
    // We need total 40 bricks. 30% are Red = 12 Red
    const colorPool: string[] = Array(12).fill(LIGHT_RED);
    const otherColors = COLORS.filter(c => c !== LIGHT_RED);
    while (colorPool.length < totalBricks) {
      colorPool.push(otherColors[Math.floor(Math.random() * otherColors.length)]);
    }

    // Fisher-Yates Shuffle for better initial randomness
    for (let i = colorPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
    }

    const grid = Array.from({ length: cols }).map(() => Array(rows).fill(null));

    // Distribute colors while trying to avoid immediate clusters
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let bestIdx = 0;
        // Search the pool for a color that doesn't match top or left neighbor
        for (let i = 0; i < colorPool.length; i++) {
          const color = colorPool[i];
          const leftNeighbor = c > 0 ? grid[c - 1][r]?.color : null;
          const topNeighbor = r > 0 ? grid[c][r - 1]?.color : null;

          if (color !== leftNeighbor && color !== topNeighbor) {
            bestIdx = i;
            break;
          }
        }
        
        const pickedColor = colorPool.splice(bestIdx, 1)[0];
        grid[c][r] = {
          x: 0,
          y: 0,
          status: 1,
          color: pickedColor
        };
      }
    }

    return grid as { x: number, y: number, status: number, color: string }[][];
  };

  const handleResize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    
    // Calculate aspect ratio or fill container
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    
    canvas.width = width;
    canvas.height = height;
    engine.current.width = width;
    engine.current.height = height;
    
    const scale = width / 400;
    engine.current.scale = scale;
    const isMobile = width < 768;
    engine.current.isMobile = isMobile;
    
    // Scale objects
    engine.current.paddle.w = 80 * scale;
    engine.current.paddle.h = 12 * scale;
    engine.current.paddle.speed = 7 * scale;
    engine.current.ball.radius = 6 * scale;
    
    if (!engine.current.isInitialized) {
      engine.current.paddle.y = height - 30 * scale;
      engine.current.paddle.x = (width - engine.current.paddle.w) / 2;
      engine.current.ball.x = width / 2;
      engine.current.ball.y = height - 40 * scale;
      
      // Start with static ball
      engine.current.ball.dx = 0;
      engine.current.ball.dy = 0;
      engine.current.redDestroyedCount = 0;
      
      engine.current.bricks = initBricks();
      engine.current.isInitialized = true;
    } else {
      engine.current.paddle.y = height - 30 * scale;
      if (engine.current.paddle.x > width - engine.current.paddle.w) {
         engine.current.paddle.x = width - engine.current.paddle.w;
      }
      // re-check ball
      if (engine.current.ball.y > height) engine.current.ball.y = height - 40 * scale;
    }
  };

  // Setup BGM
  useEffect(() => {
    const audio = new Audio('/Hyper_Speed_Run.mp3');
    audio.loop = true;
    audio.volume = 0.5; 
    bgmRef.current = audio;
    
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  // Update refs to match state
  useEffect(() => {
    stateRef.current = { lives, time, redDestroyed, gameState };
  }, [lives, time, redDestroyed, gameState]);

  useEffect(() => {
    if (gameState === 'countdown') {
      let cnt = 3;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCountdown(cnt);
      const iv = setInterval(() => {
        cnt--;
        if (cnt > 0) {
          setCountdown(cnt);
        } else {
          clearInterval(iv);
          setGameState('playing');
          if (bgmRef.current) {
            bgmRef.current.play().catch((err) => {
              console.warn('Autoplay prevented. Waiting for user interaction...', err);
              const resumeAudio = () => {
                if (bgmRef.current && bgmRef.current.paused) {
                   bgmRef.current.play().catch(()=>{});
                }
                getAudioCtx(); // Also resume audio context
                window.removeEventListener('keydown', resumeAudio);
                window.removeEventListener('touchstart', resumeAudio);
                window.removeEventListener('mousedown', resumeAudio);
              };
              window.addEventListener('keydown', resumeAudio);
              window.addEventListener('touchstart', resumeAudio);
              window.addEventListener('mousedown', resumeAudio);
            });
          }
          // Launch ball - higher baseline for mobile
          const baseSpeed = engine.current.isMobile ? 5 : 4;
          engine.current.ball.dx = baseSpeed * engine.current.scale * (Math.random() > 0.5 ? 1 : -1);
          engine.current.ball.dy = -baseSpeed * engine.current.scale;
        }
      }, 1000);
      return () => clearInterval(iv);
    }
  }, [gameState]);

  // Timer
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let iv: any;
    if (gameState === 'playing') {
      iv = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(iv);
  }, [gameState]);

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    window.addEventListener('resize', handleResize);
    handleResize();

    const drawBricks = () => {
      const { bricks, width } = engine.current;
      const cols = 8;
      const rows = 5;
      const padding = 4;
      const offsetTop = 40;
      const offsetLeft = 10 * engine.current.scale;
      const brickWidth = (width - offsetLeft * 2 - padding * (cols - 1)) / cols;
      const brickHeight = 20;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (bricks[c][r].status === 1) {
            const brickX = c * (brickWidth + padding) + offsetLeft;
            const brickY = r * (brickHeight + padding) + offsetTop;
            bricks[c][r].x = brickX;
            bricks[c][r].y = brickY;
            ctx.beginPath();
            ctx.rect(brickX, brickY, brickWidth, brickHeight);
            ctx.fillStyle = bricks[c][r].color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.strokeRect(brickX, brickY, brickWidth, brickHeight);
            ctx.closePath();
          }
        }
      }
    };

    const collisionDetection = () => {
      const { ball, bricks, width } = engine.current;
      const cols = 8;
      const rows = 5;
      const padding = 4;
      const offsetLeft = 10 * engine.current.scale;
      const brickWidth = (width - offsetLeft * 2 - padding * (cols - 1)) / cols;
      const brickHeight = 20;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const b = bricks[c][r];
          if (b.status === 1) {
            if (
              ball.x > b.x &&
              ball.x < b.x + brickWidth &&
              ball.y > b.y &&
              ball.y < b.y + brickHeight
            ) {
              ball.dy = -ball.dy;
              // Subtly increase speed per brick hit (lower acceleration)
              const speedInc = 1.01;
              const maxSpeed = 8 * engine.current.scale;
              if (Math.abs(ball.dy) < maxSpeed) {
                ball.dx *= speedInc;
                ball.dy *= speedInc;
              }
              
              b.status = 0;
              playHitSound();
              if (b.color === LIGHT_RED) {
                engine.current.redDestroyedCount += 1;
                const newCount = engine.current.redDestroyedCount;
                setRedDestroyed(newCount);
                
                if (newCount === 3) {
                  // Small delay to let the user see the final block break
                  setTimeout(() => {
                    setGameState('success');
                    if (bgmRef.current) bgmRef.current.pause();
                    const strTime = formatTime(stateRef.current.time);
                    saveScore(strTime);
                  }, 400);

                  confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                  });
                }
              }
            }
          }
        }
      }
    };

    const saveScore = async (strTime: string) => {
        try {
            await fetch('/api/ranking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName, time: strTime })
            });
        } catch (e) {
            console.error('Failed to save score', e);
        }
    };

    let animationId: number;

    const loop = () => {
      animationId = requestAnimationFrame(loop);
      
      const { gameState: currState, lives: currLives } = stateRef.current;
      if (currState !== 'playing') {
        // Just draw current state if paused or countdown
        ctx.clearRect(0, 0, engine.current.width, engine.current.height);
        drawBricks();
        
        ctx.beginPath();
        ctx.arc(engine.current.ball.x, engine.current.ball.y, engine.current.ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.closePath();

        ctx.beginPath();
        ctx.roundRect(engine.current.paddle.x, engine.current.paddle.y, engine.current.paddle.w, engine.current.paddle.h, 6 * Math.min(1, engine.current.scale));
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.closePath();

        if (currState === 'countdown') {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(0, 0, engine.current.width, engine.current.height);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 80px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(countdown.toString(), engine.current.width / 2, engine.current.height / 2);
        }
        return;
      }

      ctx.clearRect(0, 0, engine.current.width, engine.current.height);
      const e = engine.current;

      // Move Paddle
      if (e.keys.ArrowLeft && e.paddle.x > 0) {
        e.paddle.x -= e.paddle.speed;
      } else if (e.keys.ArrowRight && e.paddle.x + e.paddle.w < e.width) {
        e.paddle.x += e.paddle.speed;
      } else if (e.touchX !== null) {
        const targetX = e.touchX - e.paddle.w / 2;
        e.paddle.x += (targetX - e.paddle.x) * 0.2; // Smooth snapping
        if (e.paddle.x < 0) e.paddle.x = 0;
        if (e.paddle.x + e.paddle.w > e.width) e.paddle.x = e.width - e.paddle.w;
      }

      // Move Ball
      e.ball.x += e.ball.dx;
      e.ball.y += e.ball.dy;

      // Wall collision
      if (e.ball.x + e.ball.dx > e.width - e.ball.radius || e.ball.x + e.ball.dx < e.ball.radius) {
        e.ball.dx = -e.ball.dx;
        playWallSound();
      }
      if (e.ball.y + e.ball.dy < e.ball.radius) {
        e.ball.dy = -e.ball.dy;
        playWallSound();
      } else if (e.ball.dy > 0 && e.ball.y + e.ball.radius <= e.paddle.y && e.ball.y + e.ball.dy + e.ball.radius >= e.paddle.y) {
        // Falling down and crosses paddle top edge
        const hitLimit = e.ball.radius + 8; // Extra generous hitbox for side edges
        if (e.ball.x + hitLimit >= e.paddle.x && e.ball.x - hitLimit <= e.paddle.x + e.paddle.w) {
          // Hit paddle
          e.ball.y = e.paddle.y - e.ball.radius; // Correct position to prevent clip
          e.ball.dy = -Math.abs(e.ball.dy); // Force upward movement
          // Reduced english effect for more controlled bounces
          const hitPoint = e.ball.x - (e.paddle.x + e.paddle.w / 2);
          e.ball.dx = hitPoint * 0.1;
          playHitSound();
        }
      } else if (e.ball.y + e.ball.dy > e.height - e.ball.radius) {
        // Ball Drops
        if (currLives > 1) {
          setLives(l => l - 1);
          e.ball.x = e.width / 2;
          e.ball.y = e.paddle.y - 10 * e.scale;
          const baseSpeed = engine.current.isMobile ? 5 : 4;
          e.ball.dx = baseSpeed * e.scale * (Math.random() > 0.5 ? 1 : -1);
          e.ball.dy = -baseSpeed * e.scale;
        } else {
          setLives(0);
          setGameState('failed');
          if (bgmRef.current) bgmRef.current.pause();
        }
      }

      collisionDetection();

      drawBricks();

      // Draw Ball
      ctx.beginPath();
      ctx.arc(e.ball.x, e.ball.y, e.ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.closePath();

      // Draw Paddle
      ctx.beginPath();
      ctx.roundRect(e.paddle.x, e.paddle.y, e.paddle.w, e.paddle.h, 6 * Math.min(1, e.scale));
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
      ctx.closePath();
    };

    loop();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // Input Handlers
  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (engine.current.keys.hasOwnProperty(ev.code)) {
        (engine.current.keys as Record<string, boolean>)[ev.code] = true;
      }
    };
    const handleKeyUp = (ev: KeyboardEvent) => {
      if (engine.current.keys.hasOwnProperty(ev.code)) {
        (engine.current.keys as Record<string, boolean>)[ev.code] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    let clientX: number;
    let clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchX = clientX - rect.left;
    const touchY = clientY - rect.top;

    // Only move paddle if touch is in the bottom part of the screen (near the paddle)
    const activeZoneHeight = 200; // Activation zone in pixels from bottom
    if (touchY > rect.height - activeZoneHeight) {
      engine.current.touchX = touchX;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleRestart = () => {
    router.push('/');
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 border-x border-slate-700 w-full max-w-4xl mx-auto shadow-2xl relative select-none">
      {/* Header Info */}
      <div className="flex justify-between items-center p-4 bg-slate-800 text-white shadow-md z-10 space-x-2">
        <div className="flex items-center space-x-2 bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-600">
           <span className="text-slate-300 text-sm">목표</span>
           <span className="font-bold text-red-400">{redDestroyed}/3</span>
        </div>
        <div className="font-mono text-xl font-bold text-slate-100 flex-1 text-center">
            {formatTime(time)}
        </div>
        <div className="flex space-x-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart 
              key={i} 
              size={20} 
              className={`${i < lives ? 'fill-red-500 text-red-500 filter drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]' : 'text-slate-700'}`} 
            />
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-center space-x-4 bg-slate-800/80 p-2 z-10 text-slate-300 border-b border-slate-700">
        <button 
          onClick={() => setGameState(gameState === 'paused' ? 'playing' : 'paused')}
          className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-md transition"
          disabled={gameState === 'countdown' || gameState === 'failed' || gameState === 'success'}
        >
          {gameState === 'paused' ? <Play size={16}/> : <Pause size={16}/>}
          <span className="text-sm">{gameState === 'paused' ? '계속' : '일시정지'}</span>
        </button>
        <button onClick={handleRestart} className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-md transition">
          <RotateCcw size={16} />
          <span className="text-sm">다시 시작</span>
        </button>
        <button onClick={() => router.push('/')} className="flex items-center space-x-1 bg-red-900/50 hover:bg-red-800/50 px-3 py-1.5 rounded-md transition border border-red-500/30 text-red-200">
          <XSquare size={16} />
          <span className="text-sm">종료</span>
        </button>
      </div>

      <div 
        className="flex-1 bg-slate-900 relative touch-none cursor-crosshair overflow-hidden"
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchMove}
        onTouchEnd={() => { engine.current.touchX = null; }}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Overlay - Failed */}
      {gameState === 'failed' && (
        <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl text-center max-w-sm w-[90%]">
            <h2 className="text-3xl font-black text-red-500 mb-2">게임 미션 실패</h2>
            <p className="text-slate-400 mb-6 font-medium">아쉽습니다! 다시 도전해보세요.</p>
            <button onClick={handleRestart} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition">
              다시 시작
            </button>
          </div>
        </div>
      )}

      {/* Overlay - Success */}
      {gameState === 'success' && (
        <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
          <div className="bg-slate-800 p-8 rounded-2xl border border-yellow-500/30 shadow-[0_0_40px_rgba(234,179,8,0.2)] text-center max-w-sm w-[90%]">
             <Trophy className="mx-auto text-yellow-400 mb-4 w-16 h-16" />
            <h2 className="text-3xl font-black text-yellow-400 mb-2">미션 완료!</h2>
            <p className="text-slate-300 mb-2 text-lg">기록: <span className="font-bold text-white font-mono">{formatTime(time)}</span></p>
            <Rankings time={time} playerName={playerName} />
            <button onClick={handleRestart} className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition">
              처음으로
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Rankings({ time: _time, playerName: _playerName }: { time: number, playerName: string }) {
   const [ranks, setRanks] = useState<{name: string, time: any}[]>([]);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
       fetch('/api/ranking').then(res => res.json()).then(data => {
           setRanks(data.top3);
           setLoading(false);
       }).catch(() => {
           setLoading(false);
       });
   }, []);

   if (loading) return <div className="text-slate-400 text-sm mt-4">명예의 전당 불러오는 중...</div>;
   
   return (
       <div className="bg-slate-900/50 rounded-xl p-4 mt-6 border border-slate-700">
           <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">명예의 전당 (Top 3)</h3>
           <div className="space-y-2">
               {ranks.map((r, i) => (
                   <div key={i} className="flex justify-between text-sm items-center">
                       <span className={`font-mono font-bold ${i===0?'text-yellow-400':i===1?'text-slate-300':i===2?'text-orange-400':''}`}>{i+1}. {r.name}</span>
                       <span className="text-slate-400 font-mono">
                         {r.time}
                       </span>
                   </div>
               ))}
               {ranks.length === 0 && <div className="text-slate-500 text-xs">기록이 없습니다.</div>}
           </div>
       </div>
   );
}
