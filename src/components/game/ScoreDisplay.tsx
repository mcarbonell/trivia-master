"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface ScoreDisplayProps {
  score: {
    correct: number;
    incorrect: number;
  };
  onNewGame: () => void;
}

export function ScoreDisplay({ score, onNewGame }: ScoreDisplayProps) {
  return (
    <Card className="mb-6 w-full max-w-md shadow-lg">
      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
        <div className="flex space-x-4 text-lg">
          <span className="font-semibold flex items-center text-success">
            <CheckCircle className="mr-2 h-6 w-6" /> Correct: {score.correct}
          </span>
          <span className="font-semibold flex items-center text-destructive">
            <XCircle className="mr-2 h-6 w-6" /> Incorrect: {score.incorrect}
          </span>
        </div>
        <Button onClick={onNewGame} variant="outline" size="sm" className="text-primary border-primary hover:bg-primary/10">
          <RefreshCw className="mr-2 h-4 w-4" /> New Game
        </Button>
      </CardContent>
    </Card>
  );
}
