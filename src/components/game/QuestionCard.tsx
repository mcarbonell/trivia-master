
"use client";

// Expect a simple (monolingual) structure for display purposes
interface LocalizedQuestionData {
  question: string;
  answers: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty: "very easy" | "easy" | "medium" | "hard" | "very hard";
}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, ChevronRight, Info } from "lucide-react";
import { useTranslations } from "next-intl";

interface QuestionCardProps {
  questionData: LocalizedQuestionData; // Now expects already localized data for display
  onAnswerSelect: (answerIndex: number) => void;
  onNextQuestion: () => void;
  selectedAnswerIndex: number | null;
  feedback: { message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null; // Feedback messages are already localized
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
  const t = useTranslations();
  // questionData now directly contains localized strings
  const { question, answers, correctAnswerIndex } = questionData;

  return (
    <Card className="w-full shadow-xl animate-fadeIn">
      <CardHeader>
        <CardTitle className="font-headline text-2xl md:text-3xl text-center text-primary">{question}</CardTitle>
        {feedback && gameState === 'showing_feedback' && (
          <>
            <CardDescription className={cn(
              "text-center text-lg font-semibold mt-2 animate-pulseOnce",
              feedback.isCorrect ? "text-success" : "text-destructive"
            )}>
              {feedback.isCorrect ? <CheckCircle2 className="inline-block mr-2 h-6 w-6" /> : <XCircle className="inline-block mr-2 h-6 w-6" />}
              {feedback.message}
              {!feedback.isCorrect && feedback.detailedMessage && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">{feedback.detailedMessage}</span>
              )}
            </CardDescription>
            {/* Feedback.explanation is already localized from page.tsx */}
            {feedback.explanation && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-sm text-muted-foreground flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-primary" />
                  <span className="font-semibold mr-1">{t('explanation')}:</span>
                  {feedback.explanation}
                </p>
              </div>
            )}
          </>
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
              buttonClasses = cn(buttonClasses, "bg-success hover:bg-success/90 text-success-foreground border-success/70");
            } else if (isSelected && !isCorrect) {
              buttonClasses = cn(buttonClasses, "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-destructive/70");
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
            {t('nextQuestionButton')} <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
