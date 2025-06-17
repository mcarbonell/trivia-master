
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface ScoreDisplayProps {
  score: {
    correct: number;
    incorrect: number;
  };
  onNewGame: () => void;
  questionsAnsweredThisGame: number;
  totalQuestionsInGame: number;
}

export function ScoreDisplay({ 
  score, 
  onNewGame,
  questionsAnsweredThisGame,
  totalQuestionsInGame
}: ScoreDisplayProps) {
  const t = useTranslations();
  return (
    <Card className="mb-2 w-full max-w-xl shadow-lg">
      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-2">
        <div className="flex items-center space-x-3 text-base sm:text-lg">
          <span className="font-semibold flex items-center text-success">
            <CheckCircle className="mr-1.5 h-5 w-5 sm:h-6 sm:w-6" />
            <span className="mr-1">{t('scoreCorrect')}:</span>
            {score.correct}
          </span>
          <span className="font-semibold flex items-center text-destructive">
            <XCircle className="mr-1.5 h-5 w-5 sm:h-6 sm:w-6" />
            <span className="mr-1">{t('scoreIncorrect')}:</span>
            {score.incorrect}
          </span>
        </div>
        <div className="text-sm sm:text-base text-muted-foreground font-medium">
          {t('questionProgress', { current: questionsAnsweredThisGame + 1, total: totalQuestionsInGame })}
        </div>
        <Button 
          onClick={onNewGame} 
          variant="outline" 
          size="sm" 
          className="text-primary border-primary hover:bg-primary/10 px-2 text-xs sm:text-sm"
        >
          <RefreshCw className="mr-1.5 h-4 w-4" /> {t('newGameButton')}
        </Button>
      </CardContent>
    </Card>
  );
}
