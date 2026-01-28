'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

type Flashcard = {
  front?: string;
  back?: string;
  explanation?: string;
};

type FlashcardBlockProps = {
  front?: string;
  back?: string;
  cards?: Flashcard[];
};

export default function FlashcardBlock({
  front,
  back,
  cards
}: FlashcardBlockProps) {
  const t = useTranslations();
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  const list = useMemo<Flashcard[]>(
    () =>
      Array.isArray(cards) && cards.length > 0
        ? cards
        : [{ front, back }],
    [cards, front, back]
  );

  const validCards = useMemo(
    () => list.filter((c) => c.front && (c.back || c.explanation)),
    [list]
  );

  if (validCards.length === 0) {
    return (
      <div className="glass-surface rounded-md p-3 text-sm text-muted">
        {t('ai.blocks.flashcard')}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {validCards.map((card, idx) => {
        const isFlipped = flipped[idx] ?? false;
        const handleToggle = () =>
          setFlipped((prev) => ({ ...prev, [idx]: !isFlipped }));

        return (
          <button
            key={`flashcard-${idx}`}
            type="button"
            onClick={handleToggle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleToggle();
              }
            }}
            className="group w-full text-left focus-visible:ring-2 focus-visible:ring-cyan-400/40 rounded-2xl"
            aria-pressed={isFlipped}
          >
            <div className="relative h-48 w-full" style={{ perspective: '1200px' }}>
              <motion.div
                className="relative h-full w-full"
                style={{ transformStyle: 'preserve-3d' }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
              >
                <div
                  className="absolute inset-0 rounded-2xl glass-surface-strong bg-white dark:bg-[#0B0F19] p-5 flex items-center justify-center text-center text-sm font-semibold text-foreground"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden'
                  }}
                >
                  {card.front}
                </div>

                <div
                  className="absolute inset-0 rounded-2xl glass-surface-strong bg-white dark:bg-[#0B0F19] p-5 flex flex-col items-center justify-center text-center text-sm space-y-2 text-foreground"
                  style={{
                    transform: 'rotateY(180deg)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden'
                  }}
                >
                  {card.back ? (
                    <div>
                      <span className="font-semibold text-foreground">
                        {t('ai.blocks.flashcardAnswerLabel')}:
                      </span>{' '}
                      {card.back}
                    </div>
                  ) : null}

                  {card.explanation ? (
                    <div className="text-muted">{card.explanation}</div>
                  ) : null}
                </div>
              </motion.div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
