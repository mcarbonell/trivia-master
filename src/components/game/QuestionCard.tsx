"use client";

import type { GenerateTriviaQuestionOutput } from "@/ai/flows/generate-trivia-question";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, ChevronRight } from "lucide-react";

interface QuestionCardProps {
  questionData: GenerateTriviaQuestionOutput;
  onAnswerSelect: (answerIndex: number) => void;
  onNextQuestion: () => void;
  selectedAnswerIndex: number | null;
  feedback: { message: string; isCorrect: boolean } | null;
  gameState: 'playing' | 'showing_feedback';
}

export function QuestionCard({
  questionData,
  onAnswerSelect,
  onNextQuestion,
  selectedAnswerIndex,
  feedback,
  gameState,
}: QuestionCardProps) {
  const { question, answers, correctAnswerIndex } = questionData;

  return (
    <Card className="w-full shadow-xl animate-fadeIn">
      <CardHeader>
        <CardTitle className="font-headline text-2xl md:text-3xl text-center text-primary">{question}</CardTitle>
        {feedback && gameState === 'showing_feedback' && (
           <CardDescription className={cn(
            "text-center text-lg font-semibold mt-2 animate-pulseOnce",
            feedback.isCorrect ? "text-green-600" : "text-red-600"
          )}>
            {feedback.isCorrect ? <CheckCircle2 className="inline-block mr-2 h-6 w-6" /> : <XCircle className="inline-block mr-2 h-6 w-6" />}
            {feedback.message}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {answers.map((answer, index) => {
          const isSelected = selectedAnswerIndex === index;
          const isCorrect = index === correctAnswerIndex;
          const isRevealed = gameState === 'showing_feedback';

          let buttonVariant: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link" = "outline";
          let buttonClasses = "justify-start text-left h-auto py-3 whitespace-normal";

          if (isRevealed) {
            if (isCorrect) {
              buttonClasses = cn(buttonClasses, "bg-green-500 hover:bg-green-600 text-white border-green-700");
            } else if (isSelected && !isCorrect) {
              buttonClasses = cn(buttonClasses, "bg-red-500 hover:bg-red-600 text-white border-red-700");
            } else {
               buttonClasses = cn(buttonClasses, "bg-muted/50");
            }
          } else if (isSelected) {
             buttonClasses = cn(buttonClasses, "bg-accent text-accent-foreground");
          }


          return (
            <Button
              key={index}
              variant={buttonVariant as any} 
              className={buttonClasses}
              onClick={() => onAnswerSelect(index)}
              disabled={gameState === 'showing_feedback'}
              aria-pressed={isSelected}
            >
              <span className="mr-2 font-bold">{String.fromCharCode(65 + index)}.</span>
              {answer}
            </Button>
          );
        })}
      </CardContent>
      {gameState === 'showing_feedback' && (
        <CardFooter className="flex justify-end">
          <Button onClick={onNextQuestion} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Next Question <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// Add this to your globals.css or a style tag for subtle animations
/*
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }

@keyframes pulseOnce {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
.animate-pulseOnce { animation: pulseOnce 0.6s ease-in-out; }
*/

