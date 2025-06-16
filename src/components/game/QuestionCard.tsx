
"use client";

import { useState, useEffect } from "react";
import type { DifficultyLevel, BilingualText } from "@/types"; // Updated imports
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, ChevronRight, Info, Lightbulb, Clock, Flag } from "lucide-react"; // Added Flag
import { useTranslations } from "next-intl";
import { ReportQuestionDialog } from "./ReportQuestionDialog"; // Import the new dialog

interface LocalizedQuestionData {
  question: string;
  answers: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty: DifficultyLevel; // Keep for display consistency
  hint?: string;
}

interface QuestionCardProps {
  questionData: LocalizedQuestionData; 
  onAnswerSelect: (answerIndex: number) => void;
  onNextQuestion: () => void;
  selectedAnswerIndex: number | null;
  feedback: { message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null; 
  gameState: 'playing' | 'showing_feedback';
  timeLeft: number | null;
  questionTimeLimitSeconds: number;
  onShowHint: () => void;
  // Props needed for reporting
  questionId?: string; // Firestore ID of the question, if predefined
  bilingualQuestionText: BilingualText; // Full bilingual question text for reporting
  categoryTopicValue: string;
  currentDifficulty: DifficultyLevel; // The actual difficulty it was fetched with or adapted to
}

export function QuestionCard({
  questionData,
  onAnswerSelect,
  onNextQuestion,
  selectedAnswerIndex,
  feedback,
  gameState,
  timeLeft,
  questionTimeLimitSeconds,
  onShowHint,
  questionId,
  bilingualQuestionText,
  categoryTopicValue,
  currentDifficulty,
}: QuestionCardProps) {
  const t = useTranslations();
  const { question, answers, correctAnswerIndex, explanation, hint } = questionData;

  const [isHintVisible, setIsHintVisible] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  useEffect(() => {
    setIsHintVisible(false); // Reset hint visibility when question changes
  }, [question]);

  const handleShowHintClick = () => {
    setIsHintVisible(true);
    onShowHint(); 
  };

  const progressValue = timeLeft !== null && questionTimeLimitSeconds > 0 
    ? (timeLeft / questionTimeLimitSeconds) * 100 
    : 0;

  return (
    <>
      <Card className="w-full shadow-xl animate-fadeIn">
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="font-headline text-2xl md:text-3xl text-center text-primary flex-grow">{question}</CardTitle>
            {gameState === 'playing' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsReportDialogOpen(true)}
                className="ml-2 shrink-0 text-muted-foreground hover:text-primary"
                aria-label={t('ReportDialog.reportButtonLabel')}
              >
                <Flag className="h-5 w-5" />
              </Button>
            )}
          </div>
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
              {feedback.explanation && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm text-muted-foreground flex items-start">
                    <Info className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-primary" />
                    <span className="font-semibold mr-1">{t('explanation')}:</span>
                    {explanation}
                  </p>
                </div>
              )}
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {gameState === 'playing' && timeLeft !== null && (
            <div className="my-4">
              <Progress value={progressValue} className="w-full h-2.5 rounded-full" 
                aria-label={t('timeLeft', { seconds: timeLeft })}
              />
              <p className="text-sm text-muted-foreground text-center mt-1.5 flex items-center justify-center">
                <Clock className="h-4 w-4 mr-1.5"/> {t('timeLeft', { seconds: timeLeft })}
              </p>
            </div>
          )}

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

          {hint && gameState === 'playing' && !isHintVisible && (
            <div className="pt-3 mt-3 border-t border-border flex justify-center">
              <Button variant="outline" onClick={handleShowHintClick} className="text-primary border-primary hover:bg-primary/10">
                <Lightbulb className="mr-2 h-4 w-4" />
                {t('showHintButton')}
              </Button>
            </div>
          )}
          {isHintVisible && hint && (
            <div className="pt-3 mt-3 border-t border-border">
              <p className="text-sm text-muted-foreground flex items-start">
                <Lightbulb className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-primary" />
                <span className="font-semibold mr-1">{t('hintLabel')}:</span>
                {hint}
              </p>
            </div>
          )}
        </CardContent>
        
        {gameState === 'showing_feedback' && (
          <CardFooter className="flex justify-between items-center pt-4">
             <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsReportDialogOpen(true)}
                className="text-muted-foreground hover:text-primary"
                aria-label={t('ReportDialog.reportButtonLabel')}
              >
                <Flag className="mr-2 h-4 w-4" /> {t('ReportDialog.reportThisQuestionButton')}
              </Button>
            <Button onClick={onNextQuestion} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {t('nextQuestionButton')} <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </CardFooter>
        )}
      </Card>
      
      <ReportQuestionDialog
        open={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        questionId={questionId}
        bilingualQuestionText={bilingualQuestionText}
        categoryTopicValue={categoryTopicValue}
        difficulty={currentDifficulty}
      />
    </>
  );
}
