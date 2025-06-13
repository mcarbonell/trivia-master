
"use client";

import { useState, useEffect } from "react";
import { generateTriviaQuestion, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionInput } from "@/ai/flows/generate-trivia-question";
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from "next-intl";
import {
  Lightbulb,
  Landmark,
  Trophy,
  Film,
  Globe2,
  Music,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const MAX_PERFORMANCE_HISTORY = 10; 

type GameState = 'category_selection' | 'loading_question' | 'playing' | 'showing_feedback' | 'error';
type PerformanceHistoryEntry = { questionText: string; answeredCorrectly: boolean };

export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale();

  const PREDEFINED_CATEGORIES = [
    { name: t('categories.science'), icon: Lightbulb, topicValue: "Science" },
    { name: t('categories.history'), icon: Landmark, topicValue: "World History" },
    { name: t('categories.sports'), icon: Trophy, topicValue: "Sports" },
    { name: t('categories.movies'), icon: Film, topicValue: "Movies" },
    { name: t('categories.geography'), icon: Globe2, topicValue: "Geography" },
    { name: t('categories.music'), icon: Music, topicValue: "Popular Music History" },
  ];

  const [gameState, setGameState] = useState<GameState>('category_selection');
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [questionData, setQuestionData] = useState<GenerateTriviaQuestionOutput | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [askedQuestions, setAskedQuestions] = useState<string[]>([]);
  const [askedCorrectAnswers, setAskedCorrectAnswers] = useState<string[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceHistoryEntry[]>([]);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);


  const fetchQuestion = async (topic: string) => {
    setGameState('loading_question');
    setSelectedAnswerIndex(null);
    setFeedback(null);

    const inputForAI: GenerateTriviaQuestionInput = { 
      topic, 
      previousQuestions: askedQuestions,
      previousCorrectAnswers: askedCorrectAnswers,
      language: locale, 
    };
    if (performanceHistory.length > 0) {
      inputForAI.performanceHistory = performanceHistory;
    }

    try {
      const data = await generateTriviaQuestion(inputForAI);
      setQuestionData(data);
      if (data.question) {
        setAskedQuestions(prev => [...prev, data.question]);
      }
      setGameState('playing');
    } catch (err) {
      console.error("Failed to generate question:", err);
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
      setGameState('error');
    }
  };

  const handleStartGame = (topic: string) => {
    setCurrentTopic(topic);
    setScore({ correct: 0, incorrect: 0 }); 
    setAskedQuestions([]); 
    setAskedCorrectAnswers([]);
    setPerformanceHistory([]);
    fetchQuestion(topic);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing') return;

    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === questionData.correctAnswerIndex;
    const correctAnswerText = questionData.answers[questionData.correctAnswerIndex];
    
    const newHistoryEntry: PerformanceHistoryEntry = { 
      questionText: questionData.question, 
      answeredCorrectly: isCorrect 
    };
    setPerformanceHistory(prev => {
      const updatedHistory = [...prev, newHistoryEntry];
      return updatedHistory.slice(-MAX_PERFORMANCE_HISTORY); 
    });

    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: questionData.explanation });
      setAskedCorrectAnswers(prev => [...prev, correctAnswerText]);
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setFeedback({ 
        message: t('incorrect'), 
        detailedMessage: t('correctAnswerWas', { answer: correctAnswerText }), 
        isCorrect: false,
        explanation: questionData.explanation
      });
    }
    setGameState('showing_feedback');
  };

  const handleNextQuestion = () => {
    fetchQuestion(currentTopic);
  };

  const handleNewGame = () => {
    setGameState('category_selection');
    setScore({ correct: 0, incorrect: 0 });
    setQuestionData(null);
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setCurrentTopic('');
    setCustomTopicInput('');
    setAskedQuestions([]);
    setAskedCorrectAnswers([]);
    setPerformanceHistory([]);
  };

  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen text-foreground">
      <header className="my-6 sm:my-8 text-center w-full">
        <div className="flex justify-between items-center mb-2 sm:mb-4">
          <div></div> {/* Spacer */}
          <h1 className="text-3xl sm:text-5xl font-headline font-bold text-primary">{t('pageTitle')}</h1>
          <LanguageSwitcher />
        </div>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('pageDescription')}</p>
      </header>

      {gameState !== 'category_selection' && gameState !== 'loading_question' && (
        <ScoreDisplay score={score} onNewGame={handleNewGame} />
      )}

      <main className="w-full max-w-2xl flex-grow flex flex-col justify-center">
        {gameState === 'category_selection' && (
          <CategorySelector
            predefinedCategories={PREDEFINED_CATEGORIES}
            customTopicInput={customTopicInput}
            onCustomTopicChange={setCustomTopicInput}
            onSelectTopic={handleStartGame}
          />
        )}
        {gameState === 'loading_question' && (
          <Card className="p-8 text-center animate-fadeIn shadow-xl">
            <CardContent className="flex flex-col items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <p className="mt-6 text-xl font-semibold text-muted-foreground">{t('loadingQuestion', { topic: currentTopic })}</p>
            </CardContent>
          </Card>
        )}
        {(gameState === 'playing' || gameState === 'showing_feedback') && questionData && (
          <QuestionCard
            questionData={questionData}
            onAnswerSelect={handleAnswerSelect}
            onNextQuestion={handleNextQuestion}
            selectedAnswerIndex={selectedAnswerIndex}
            feedback={feedback}
            gameState={gameState}
          />
        )}
         {gameState === 'error' && feedback && (
          <Card className="p-6 text-center animate-fadeIn shadow-xl border-destructive">
            <CardHeader>
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <CardTitle className="font-headline text-2xl text-destructive">{feedback.message}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{feedback.detailedMessage || "An unexpected error occurred."}</p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-center gap-2">
              {currentTopic && <Button onClick={() => fetchQuestion(currentTopic)} variant="outline">{t('errorTryAgainTopic', {topic: currentTopic})}</Button>}
              <Button onClick={handleNewGame} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('errorChooseNewTopic')}</Button>
            </CardFooter>
          </Card>
        )}
      </main>

      <footer className="mt-auto pt-8 pb-4 text-center text-sm text-muted-foreground">
        {currentYear !== null && <p>{t('footerText', { year: currentYear })}</p>}
      </footer>
    </div>
  );
}
