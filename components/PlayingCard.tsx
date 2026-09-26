"use client";
import { motion } from "framer-motion";
import { Card, RANKS, rankOf, SUIT_SYMBOL, SUITS, suitOf } from "@/lib/poker/cards";

const SIZES = {
  sm: "w-8 h-11 text-[13px] rounded-[5px]",
  md: "w-11 h-[62px] text-lg rounded-md",
  lg: "w-14 h-20 text-2xl rounded-lg",
};

export function PlayingCard({
  card,
  hidden = false,
  size = "md",
  delay = 0,
  dim = false,
  highlight = false,
}: {
  card?: Card;
  hidden?: boolean;
  size?: keyof typeof SIZES;
  delay?: number;
  dim?: boolean;
  highlight?: boolean;
}) {
  const faceDown = hidden || card === undefined;
  const suit = card !== undefined ? SUITS[suitOf(card)] : "s";
  const red = suit === "h" || suit === "d";
  const rank = card !== undefined ? RANKS[rankOf(card)] : "";
  return (
    <motion.div
      initial={{ y: -30, opacity: 0, rotate: -8 }}
      animate={{ y: 0, opacity: dim ? 0.35 : 1, rotate: 0 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 22 }}
      className={`${SIZES[size]} relative shrink-0 select-none overflow-hidden border shadow-[0_4px_10px_rgba(0,0,0,0.45)] ${
        faceDown ? "card-back border-[#8a6a2a]/60" : "border-black/10 bg-[var(--card)]"
      } ${highlight ? "ring-2 ring-brass" : ""}`}
    >
      {!faceDown && (
        <div className={`flex h-full flex-col items-center justify-center leading-none ${red ? "text-[#c0302b]" : "text-[#16181d]"}`}>
          <span className="num font-bold">{rank === "T" ? "10" : rank}</span>
          <span className="-mt-0.5">{SUIT_SYMBOL[suit]}</span>
        </div>
      )}
    </motion.div>
  );
}
