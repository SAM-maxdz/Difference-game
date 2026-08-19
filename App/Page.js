"use client";

import { useState } from "react";

export default function Home() {
  const [name, setName] = useState("");

  return (
    <main className="min-h-screen bg-[#090705] text-white overflow-hidden">
      
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#3a2108_0%,#120b05_35%,#050403_75%)]" />

        <div className="absolute top-[-150px] left-[-150px] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] animate-pulse" />

        <div className="absolute bottom-[-200px] right-[-150px] w-[600px] h-[600px] rounded-full bg-red-900/20 blur-[140px] animate-pulse" />

        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-5 py-10">

        <div className="w-full max-w-md text-center">

          {/* Logo */}
          <div className="mb-8">
            <div className="text-5xl mb-3">♠ ♥ ♦ ♣</div>

            <h1 className="text-4xl md:text-5xl font-black tracking-[0.15em] text-amber-400">
              DIFFERENCE
            </h1>

            <p className="mt-2 tracking-[0.4em] text-amber-100/60 text-sm">
              THE GAME
            </p>
          </div>

          {/* Card */}
          <div className="rounded-3xl border border-amber-400/30 bg-black/60 backdrop-blur-xl shadow-[0_0_80px_rgba(245,158,11,0.12)] p-7">

            <div className="mb-7">
              <h2 className="text-2xl font-bold text-white">
                Welcome to the Table
              </h2>

              <p className="mt-2 text-sm text-white/50">
                Find the differences before time runs out.
              </p>
            </div>

            {/* Name */}
            <div className="text-left mb-5">
              <label className="block text-xs tracking-[0.2em] text-amber-300/70 mb-2">
                PLAYER NAME
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={16}
                className="w-full rounded-xl border border-amber-400/20 bg-white/5 px-4 py-4 outline-none transition focus:border-amber-400/70 focus:bg-white/10"
              />
            </div>

            {/* Avatar preview */}
            <div className="mb-6">
              <div className="text-xs tracking-[0.2em] text-amber-300/70 mb-3">
                YOUR AVATAR
              </div>

              <div className="mx-auto w-20 h-20 rounded-full border-2 border-amber-400/50 bg-gradient-to-br from-amber-300/20 to-red-900/40 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                🎩
              </div>
            </div>

            {/* Join */}
            <button
              disabled={!name.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-300 py-4 font-black tracking-[0.15em] text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-30"
            >
              JOIN TABLE
            </button>

            <div className="mt-5 text-xs text-white/30">
              🔒 Private game • No account required
            </div>

          </div>

          {/* Bottom */}
          <div className="mt-7 text-xs tracking-widest text-amber-100/30">
            UP TO 10 PLAYERS
          </div>

        </div>
      </div>
    </main>
  );
}
