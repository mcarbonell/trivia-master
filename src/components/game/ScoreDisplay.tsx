
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
    <Card className="mb-6 w-full max-w-xl shadow-lg">
      <CardContent className="p-5 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-2">
        <div className="flex items-center space-x-3 text-lg"> {/* Reduced from space-x-6 to space-x-3 */}
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
        <Button 
          onClick={onNewGame} 
          variant="outline" 
          size="sm" 
          className="text-primary border-primary hover:bg-primary/10 px-2" // Added px-2 here
        >
          <RefreshCw className="mr-2 h-4 w-4" /> {t('newGameButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

