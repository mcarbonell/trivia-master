
"use client";

import { useState, useEffect, useCallback } from "react";
import { generateTriviaQuestion, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { getPredefinedQuestion, type PredefinedQuestion } from "@/services/triviaService";
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from "next-intl";
import type { AppLocale } from "@/lib/i18n-config";
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

// QuestionData will now hold the bilingual structure from GenerateTriviaQuestionOutput
// or PredefinedQuestion (which extends it)
type CurrentQuestionData = GenerateTriviaQuestionOutput & { id?: string }; // id is optional, present for Firestore questions

export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale; // Ensure locale is typed for indexing

  const PREDEFINED_CATEGORIES = [
    { name: t('categories.science'), icon: Lightbulb, topicValue: "Science" },
    { name: t('categories.history'), icon: Landmark, topicValue: "World History" },
    { name: t('categories.sports'), icon: Trophy, topicValue: "Sports" },
    { name: t('categories.movies'), icon: Film, topicValue: "Movies" },
    { name: t('categories.geography'), icon: Globe2, topicValue: "Geography" },
    { name: t('categories.music'), icon: Music, topicValue: "Popular Music History" },
  ];
  const predefinedTopicValues = PREDEFINED_CATEGORIES.map(c => c.topicValue);

  const [gameState, setGameState] = useState<GameState>('category_selection');
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [questionData, setQuestionData] = useState<CurrentQuestionData | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');
  
  // askedQuestionIdentifiers: stores Firestore IDs for predefined, or question text (current locale) for Genkit Qs
  const [askedQuestionIdentifiers, setAskedQuestionIdentifiers] = useState<string[]>([]);
  // askedCorrectAnswerTexts: stores correct answer texts in current locale for Genkit Qs previousCorrectAnswers
  const [askedCorrectAnswerTexts, setAskedCorrectAnswerTexts] = useState<string[]>([]);

  const [performanceHistory, setPerformanceHistory] = useState<PerformanceHistoryEntry[]>([]);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const fetchQuestion = useCallback(async (topic: string) => {
    setGameState('loading_question');
    setSelectedAnswerIndex(null);
    setFeedback(null);

    let newQuestionData: CurrentQuestionData | null = null;
    const isPredefinedTopic = predefinedTopicValues.includes(topic);

    if (isPredefinedTopic) {
      try {
        console.log(`Fetching predefined question for topic: ${topic}, asked IDs: ${askedQuestionIdentifiers.filter(id => !id.startsWith("genkit_")).length}`);
        // Pass only Firestore IDs for predefined question fetching
        const predefinedIds = askedQuestionIdentifiers.filter(id => !id.includes("genkit_question_"));
        newQuestionData = await getPredefinedQuestion(topic, predefinedIds);
        if (newQuestionData) {
          console.log("Predefined bilingual question found:", newQuestionData.question.en.substring(0,30)+"...");
        } else {
          console.log("No suitable predefined question found, falling back to Genkit.");
        }
      } catch (firestoreError) {
        console.error("Error fetching from Firestore, falling back to Genkit:", firestoreError);
      }
    }

    if (!newQuestionData) {
      // For Genkit, previousQuestions and previousCorrectAnswers are simple text arrays (current lang)
      const inputForAI: GenerateTriviaQuestionInput = {
        topic,
        previousQuestions: askedQuestionIdentifiers.filter(id => id.startsWith("genkit_question_")).map(id => id.replace("genkit_question_", "")), // Only pass texts of genkit questions
        previousCorrectAnswers: askedCorrectAnswerTexts, // Only pass texts of genkit answers
      };
      if (performanceHistory.length > 0) {
        inputForAI.performanceHistory = performanceHistory;
      }
      try {
        console.log("Generating bilingual question with Genkit for topic:", topic);
        newQuestionData = await generateTriviaQuestion(inputForAI);
        // For Genkit questions, we'll use its current language text for askedCorrectAnswerTexts
        if (newQuestionData && newQuestionData.answers && newQuestionData.answers[newQuestionData.correctAnswerIndex]) {
           const correctAnswerTextInLocale = newQuestionData.answers[newQuestionData.correctAnswerIndex]![locale];
           setAskedCorrectAnswerTexts(prev => [...prev, correctAnswerTextInLocale]);
        }
      } catch (genkitError) {
        console.error("Failed to generate bilingual question with Genkit:", genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        return;
      }
    }

    if (newQuestionData) {
      setQuestionData(newQuestionData);
      if (newQuestionData.id) { // Predefined question from Firestore
        setAskedQuestionIdentifiers(prev => [...prev, newQuestionData!.id!]);
      } else { // Question from Genkit
        setAskedQuestionIdentifiers(prev => [...prev, `genkit_question_${newQuestionData!.question[locale]}`]);
      }
      setGameState('playing');
    } else {
      console.error("No question data could be obtained.");
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
      setGameState('error');
    }
  }, [locale, askedQuestionIdentifiers, askedCorrectAnswerTexts, performanceHistory, predefinedTopicValues, t]);

  const handleStartGame = (topic: string) => {
    setCurrentTopic(topic);
    setScore({ correct: 0, incorrect: 0 });
    setAskedQuestionIdentifiers([]);
    setAskedCorrectAnswerTexts([]);
    setPerformanceHistory([]);
    fetchQuestion(topic);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing') return;

    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === questionData.correctAnswerIndex;
    const correctAnswerTextInLocale = questionData.answers[questionData.correctAnswerIndex]![locale];
    const explanationInLocale = questionData.explanation[locale];
    
    const newHistoryEntry: PerformanceHistoryEntry = {
      questionText: questionData.question[locale],
      answeredCorrectly: isCorrect
    };
    setPerformanceHistory(prev => {
      const updatedHistory = [...prev, newHistoryEntry];
      return updatedHistory.slice(-MAX_PERFORMANCE_HISTORY);
    });

    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: explanationInLocale });
      // For Genkit generated questions, correct answer text added to askedCorrectAnswerTexts in fetchQuestion
      // For Firestore questions, repetition is handled by ID.
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setFeedback({
        message: t('incorrect'),
        detailedMessage: t('correctAnswerWas', { answer: correctAnswerTextInLocale }),
        isCorrect: false,
        explanation: explanationInLocale
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
    setAskedQuestionIdentifiers([]);
    setAskedCorrectAnswerTexts([]);
    setPerformanceHistory([]);
  };

  // Extracted question data for the current locale to pass to QuestionCard
  const localizedQuestionCardData = questionData ? {
    question: questionData.question[locale],
    answers: questionData.answers.map(ans => ans[locale]),
    correctAnswerIndex: questionData.correctAnswerIndex,
    explanation: questionData.explanation[locale], // Pass localized explanation
    difficulty: questionData.difficulty, // Difficulty is not localized
  } : null;


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
        {(gameState === 'playing' || gameState === 'showing_feedback') && localizedQuestionCardData && (
          <QuestionCard
            // Pass the localized data structure to QuestionCard
            questionData={{
                question: localizedQuestionCardData.question,
                answers: localizedQuestionCardData.answers,
                correctAnswerIndex: localizedQuestionCardData.correctAnswerIndex,
                explanation: localizedQuestionCardData.explanation,
                difficulty: localizedQuestionCardData.difficulty,
            }}
            onAnswerSelect={handleAnswerSelect}
            onNextQuestion={handleNextQuestion}
            selectedAnswerIndex={selectedAnswerIndex}
            feedback={feedback} // Feedback messages are already translated by useTranslations
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
