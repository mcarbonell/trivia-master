
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
}

export function ScoreDisplay({ score, onNewGame }: ScoreDisplayProps) {
  const t = useTranslations();
  return (
    <Card className="mb-6 w-full max-w-md shadow-lg">
      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
        <div className="flex items-center space-x-4 text-lg">
          <span className="font-semibold flex items-center text-success">
            <CheckCircle className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
            <span className="mr-1.5">{t('scoreCorrect')}:</span>
            {score.correct}
          </span>
          <span className="font-semibold flex items-center text-destructive">
            <XCircle className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
            <span className="mr-1.5">{t('scoreIncorrect')}:</span>
            {score.incorrect}
          </span>
        </div>
        <Button onClick={onNewGame} variant="outline" size="sm" className="text-primary border-primary hover:bg-primary/10 whitespace-nowrap">
          <RefreshCw className="mr-2 h-4 w-4" /> {t('newGameButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

