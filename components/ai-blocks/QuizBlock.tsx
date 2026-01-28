'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

type QuizQuestion = {
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  answer?: string;
};

type QuizBlockProps = {
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  answer?: string;
  questions?: QuizQuestion[];
};

export default function QuizBlock({
  question,
  options,
  correctIndex,
  explanation,
  answer,
  questions
}: QuizBlockProps) {
  const t = useTranslations();
  const [selected, setSelected] = useState<Record<number, number | null>>({});

  const list = useMemo<QuizQuestion[]>(
    () =>
      Array.isArray(questions) && questions.length > 0
        ? questions
        : [{ question, options, correctIndex, explanation, answer }],
    [questions, question, options, correctIndex, explanation, answer]
  );

  const validQuestions = useMemo(
    () =>
      list.filter(
        (item) => item.question && Array.isArray(item.options) && item.options.length > 0
      ),
    [list]
  );

  if (validQuestions.length === 0) {
    return (
      <div className="glass-surface rounded-md p-3 text-sm text-muted">
        {t('ai.blocks.quiz')}
      </div>
    );
  }

  const answeredCount = validQuestions.reduce(
    (count, _item, idx) =>
      selected[idx] !== null && selected[idx] !== undefined ? count + 1 : count,
    0
  );
  const progress = validQuestions.length > 0 ? (answeredCount / validQuestions.length) * 100 : 0;

  return (
    <div className="glass-surface-strong rounded-2xl p-4 sm:p-5 space-y-5">
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted">
          {t('ai.blocks.quizProgress')}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--border)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {validQuestions.map((item, qIndex) => {
        const candidateIndex =
          item.correctIndex ??
          (item.answer ? item.options!.findIndex((opt) => opt === item.answer) : undefined);
        const resolvedCorrectIndex =
          typeof candidateIndex === 'number' && candidateIndex >= 0 ? candidateIndex : undefined;
        const chosen = selected[qIndex] ?? null;
        const isAnswered = chosen !== null;
        const isCorrect = resolvedCorrectIndex !== undefined && chosen === resolvedCorrectIndex;

        return (
          <div key={`quiz-${qIndex}`} className="space-y-4">
            <div className="text-sm font-semibold text-foreground">{item.question}</div>
            <div className="grid gap-3">
              {item.options!.map((option, idx) => {
                const isChosen = chosen === idx;
                const isCorrectOption = resolvedCorrectIndex === idx;
                const showCorrect = isAnswered && isCorrectOption;
                const showIncorrect = isAnswered && isChosen && !isCorrect;

                const baseClass =
                  'rounded-2xl border px-4 py-3 text-left text-sm transition';
                const stateClass = showCorrect
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                  : showIncorrect
                  ? 'border-red-400/60 bg-red-500/15 text-red-700 dark:text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                  : 'border-[color:var(--border)] bg-[color:var(--surface-2)] text-foreground';
                const hoverClass = isAnswered
                  ? 'cursor-default'
                  : 'hover:border-blue-400/40 hover:shadow-[0_0_16px_rgba(59,130,246,0.2)]';

                return (
                  <motion.button
                    key={`option-${qIndex}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (isAnswered) return;
                      setSelected((prev) => ({ ...prev, [qIndex]: idx }));
                    }}
                    disabled={isAnswered}
                    className={`${baseClass} ${stateClass} ${hoverClass}`}
                    whileTap={!isAnswered ? { scale: 0.98 } : undefined}
                    animate={
                      showIncorrect
                        ? { x: [0, -6, 6, -4, 4, 0] }
                        : isChosen && isCorrect
                        ? { scale: [1, 1.02, 1] }
                        : { scale: 1 }
                    }
                  >
                    {option}
                  </motion.button>
                );
              })}
            </div>

            {isAnswered && (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-muted space-y-2">
                {resolvedCorrectIndex !== undefined && (
                  <div className={isCorrect ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'}>
                    {isCorrect ? t('ai.blocks.quizCorrect') : t('ai.blocks.quizIncorrect')}
                  </div>
                )}
                {!isCorrect && resolvedCorrectIndex !== undefined && (
                  <div>
                    <span className="font-semibold text-foreground">
                      {t('ai.blocks.quizCorrectAnswerLabel')}:
                    </span>{' '}
                    {item.options![resolvedCorrectIndex]}
                  </div>
                )}
                {item.explanation ? (
                  <div>
                    <span className="font-semibold text-foreground">
                      {t('ai.blocks.quizExplanationLabel')}:
                    </span>{' '}
                    {item.explanation}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}