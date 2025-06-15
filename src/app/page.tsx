
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestion, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { getPredefinedQuestion, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import type { CategoryDefinition } from "@/types";
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from "next-intl";
import type { AppLocale } from "@/lib/i18n-config";
import {
  Loader2,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Minus,
} from "lucide-react";


type GameState = 'loading_categories' | 'category_selection' | 'loading_question' | 'playing' | 'showing_feedback' | 'error';

type CurrentQuestionData = GenerateTriviaQuestionOutput & { id?: string }; // id for Firestore questions

const DIFFICULTY_LEVELS_ORDER: DifficultyLevel[] = ["very easy", "easy", "medium", "hard", "very hard"];
const QUESTION_TIME_LIMIT_SECONDS = 30;

export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [appCategories, setAppCategories] = useState<CategoryDefinition[]>([]);
  const [gameState, setGameState] = useState<GameState>('loading_categories');
  const [currentTopic, setCurrentTopic] = useState<string>(''); // This will be the topicValue for AI
  const [currentCategoryDetails, setCurrentCategoryDetails] = useState<CategoryDefinition | null>(null);
  
  const [questionData, setQuestionData] = useState<CurrentQuestionData | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');
  
  const [askedQuestionIdentifiers, setAskedQuestionIdentifiers] = useState<string[]>([]);
  const [askedCorrectAnswerTexts, setAskedCorrectAnswerTexts] = useState<string[]>([]);

  const [currentDifficultyLevel, setCurrentDifficultyLevel] = useState<DifficultyLevel>("medium");
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());

    const fetchCategories = async () => {
      const categories = await getAppCategories();
      setAppCategories(categories);
      if (categories.length > 0) {
        setGameState('category_selection');
      } else {
        setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
        setGameState('error');
      }
    };
    fetchCategories();
  }, [t]);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer(); 
    setTimeLeft(QUESTION_TIME_LIMIT_SECONDS);
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime === null || prevTime <= 1) {
          clearTimer();
          return 0; 
        }
        return prevTime - 1;
      });
    }, 1000);
  }, [clearTimer]);
  
  const handleTimeout = useCallback(() => {
    if (!questionData || gameState !== 'playing') return; 

    clearTimer(); 
    setSelectedAnswerIndex(null); 
    setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
    
    const correctAnswerText = questionData.answers[questionData.correctAnswerIndex]?.[locale] ?? t('errorLoadingQuestionDetail');
    const explanationText = questionData.explanation?.[locale] ?? '';

    setFeedback({
      message: t('timesUp'),
      detailedMessage: t('correctAnswerWas', { answer: correctAnswerText }),
      isCorrect: false,
      explanation: explanationText
    });

    const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
    if (currentIndex > 0) {
      setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
    }
    setGameState('showing_feedback');
  }, [questionData, gameState, clearTimer, currentDifficultyLevel, locale, t, setScore, setFeedback, setCurrentDifficultyLevel, setGameState, setSelectedAnswerIndex]);


  useEffect(() => {
    if (timeLeft === 0 && gameState === 'playing') {
      handleTimeout();
    }
  }, [timeLeft, gameState, handleTimeout]);

  useEffect(() => {
    if (gameState === 'playing' && questionData) {
      startTimer();
    } else {
      clearTimer();
      setTimeLeft(null); 
    }
    return () => {
      clearTimer();
    };
  }, [gameState, questionData, startTimer, clearTimer]);


  const fetchQuestion = useCallback(async (topic: string, difficulty: DifficultyLevel, categoryDetails: CategoryDefinition | null) => {
    setGameState('loading_question');
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null); 

    let newQuestionData: CurrentQuestionData | null = null;
    const isPredefinedTopic = appCategories.some(cat => cat.topicValue === topic);

    if (isPredefinedTopic) {
      try {
        newQuestionData = await getPredefinedQuestion(topic, askedQuestionIdentifiers, difficulty);
      } catch (firestoreError) {
        console.warn("Error fetching from Firestore, falling back to Genkit for predefined topic:", firestoreError);
      }
    }

    if (!newQuestionData) {
      const inputForAI: GenerateTriviaQuestionInput = {
        topic,
        previousQuestions: askedQuestionIdentifiers.filter(id => id.startsWith("genkit_question_")).map(id => id.replace("genkit_question_", "")),
        previousCorrectAnswers: askedCorrectAnswerTexts,
        targetDifficulty: difficulty,
      };

      if (categoryDetails) { 
        inputForAI.categoryInstructions = categoryDetails.detailedPromptInstructions; // This is now a string (English)
        if (categoryDetails.difficultySpecificGuidelines && categoryDetails.difficultySpecificGuidelines[difficulty]) {
          inputForAI.difficultySpecificInstruction = categoryDetails.difficultySpecificGuidelines[difficulty]; // Also a string (English)
        }
      }
      
      try {
        newQuestionData = await generateTriviaQuestion(inputForAI);
         if (newQuestionData && newQuestionData.answers && typeof newQuestionData.correctAnswerIndex === 'number' && newQuestionData.answers[newQuestionData.correctAnswerIndex]) {
           const correctAnswerTextInLocale = newQuestionData.answers[newQuestionData.correctAnswerIndex]![locale];
           if(!newQuestionData.id) { 
             setAskedCorrectAnswerTexts(prev => [...new Set([...prev, correctAnswerTextInLocale])]);
           }
        }
      } catch (genkitError) {
        console.error(`Failed to generate question with Genkit (topic: ${topic}, difficulty: ${difficulty}):`, genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        return;
      }
    }

    if (newQuestionData) {
      setQuestionData(newQuestionData);
      if (newQuestionData.id) { 
        setAskedQuestionIdentifiers(prev => [...new Set([...prev, newQuestionData!.id!])]);
      } else { 
        const questionTextIdentifier = newQuestionData.question?.[locale] || `genkit_q_${Date.now()}`;
        setAskedQuestionIdentifiers(prev => [...new Set([...prev, `genkit_question_${questionTextIdentifier}`])]);
      }
      setGameState('playing'); 
    } else {
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionForDifficulty', {difficulty: t(`difficultyLevels.${difficulty}` as any) as string }), isCorrect: false });
      setGameState('error');
    }
  }, [locale, askedQuestionIdentifiers, askedCorrectAnswerTexts, appCategories, t]); 

  const handleStartGame = (topicOrTopicValue: string) => {
    const selectedPredefinedCategory = appCategories.find(cat => cat.topicValue === topicOrTopicValue);
    
    setCurrentTopic(topicOrTopicValue); 
    setCurrentCategoryDetails(selectedPredefinedCategory || null); 
    
    setScore({ correct: 0, incorrect: 0 });
    setAskedQuestionIdentifiers([]);
    setAskedCorrectAnswerTexts([]);
    const initialDifficulty: DifficultyLevel = "medium";
    setCurrentDifficultyLevel(initialDifficulty);
    fetchQuestion(topicOrTopicValue, initialDifficulty, selectedPredefinedCategory || null);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing') return;

    clearTimer(); 
    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === questionData.correctAnswerIndex;
    const correctAnswerTextInLocale = questionData.answers[questionData.correctAnswerIndex]![locale];
    const explanationInLocale = questionData.explanation[locale];
    
    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: explanationInLocale });
      const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (currentIndex < DIFFICULTY_LEVELS_ORDER.length - 1) {
        setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex + 1]!);
      }
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setFeedback({
        message: t('incorrect'),
        detailedMessage: t('correctAnswerWas', { answer: correctAnswerTextInLocale }),
        isCorrect: false,
        explanation: explanationInLocale
      });
      const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (currentIndex > 0) {
        setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
      }
    }
    setGameState('showing_feedback');
  };

  const handleNextQuestion = () => {
    fetchQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
  };

  const handleNewGame = () => {
    setGameState('category_selection'); 
    setScore({ correct: 0, incorrect: 0 });
    setQuestionData(null);
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setCurrentTopic('');
    setCustomTopicInput('');
    setCurrentCategoryDetails(null);
    setAskedQuestionIdentifiers([]);
    setAskedCorrectAnswerTexts([]);
    setCurrentDifficultyLevel("medium");
    setTimeLeft(null); 
  };
  
  const DifficultyIndicator = () => {
    let Icon = Minus;
    let color = "text-muted-foreground";
    let text = t(`difficultyLevels.${currentDifficultyLevel}` as any); 

    const levelIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);

    if (levelIndex <= 1) { 
        Icon = ChevronDown;
        color = "text-green-500";
    } else if (levelIndex === 2) { 
        Icon = Minus;
        color = "text-yellow-500";
    } else { 
        Icon = ChevronUp;
        color = "text-red-500";
    }

    return (
        <div className={`flex items-center text-sm ${color} font-medium`}>
            <Icon className="h-5 w-5 mr-1" />
            {text}
        </div>
    );
};

  const localizedQuestionCardData = questionData ? {
    question: questionData.question[locale],
    answers: questionData.answers.map(ans => ans[locale]),
    correctAnswerIndex: questionData.correctAnswerIndex,
    explanation: questionData.explanation[locale],
    difficulty: questionData.difficulty, 
    hint: questionData.hint?.[locale],
  } : null;


  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen text-foreground">
      <header className="my-6 sm:my-8 text-center w-full">
        <div className="flex justify-between items-center mb-2 sm:mb-4">
          <div></div> 
          <h1 className="text-3xl sm:text-5xl font-headline font-bold text-primary">{t('pageTitle')}</h1>
          <LanguageSwitcher />
        </div>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('pageDescription')}</p>
      </header>

      {gameState !== 'category_selection' && gameState !== 'loading_question' && gameState !== 'loading_categories' && (
        <div className="w-full max-w-2xl mb-4">
           <ScoreDisplay score={score} onNewGame={handleNewGame} />
           <div className="flex justify-center mt-2">
             <DifficultyIndicator />
           </div>
        </div>
      )}

      <main className="w-full max-w-2xl flex-grow flex flex-col justify-center">
        {gameState === 'loading_categories' && (
           <Card className="p-8 text-center shadow-xl">
            <CardContent className="flex flex-col items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <p className="mt-6 text-xl font-semibold text-muted-foreground">{t('loadingCategories')}</p>
            </CardContent>
          </Card>
        )}
        {gameState === 'category_selection' && appCategories.length > 0 && (
          <CategorySelector
            predefinedCategories={appCategories}
            customTopicInput={customTopicInput}
            onCustomTopicChange={setCustomTopicInput}
            onSelectTopic={handleStartGame} 
            currentLocale={locale}
          />
        )}
        {gameState === 'loading_question' && (
          <Card className="p-8 text-center animate-fadeIn shadow-xl">
            <CardContent className="flex flex-col items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <p className="mt-6 text-xl font-semibold text-muted-foreground">{t('loadingQuestionWithDifficulty', { topic: currentCategoryDetails?.name[locale] || currentTopic, difficulty: t(`difficultyLevels.${currentDifficultyLevel}` as any) })}</p>
            </CardContent>
          </Card>
        )}
        {(gameState === 'playing' || gameState === 'showing_feedback') && localizedQuestionCardData && (
          <QuestionCard
            questionData={{
                question: localizedQuestionCardData.question,
                answers: localizedQuestionCardData.answers,
                correctAnswerIndex: localizedQuestionCardData.correctAnswerIndex,
                explanation: localizedQuestionCardData.explanation,
                difficulty: localizedQuestionCardData.difficulty, 
                hint: localizedQuestionCardData.hint,
            }}
            onAnswerSelect={handleAnswerSelect}
            onNextQuestion={handleNextQuestion}
            selectedAnswerIndex={selectedAnswerIndex}
            feedback={feedback}
            gameState={gameState}
            timeLeft={timeLeft}
            questionTimeLimitSeconds={QUESTION_TIME_LIMIT_SECONDS}
          />
        )}
         {gameState === 'error' && feedback && (
          <Card className="p-6 text-center animate-fadeIn shadow-xl border-destructive">
            <CardHeader>
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <CardTitle className="font-headline text-2xl text-destructive">{feedback.message}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{feedback.detailedMessage || t('errorLoadingQuestionDetail')}</p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-center gap-2">
              {currentTopic && gameState === 'error' && !feedback.message.includes(t('errorLoadingCategories')) && (
                <Button onClick={() => fetchQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails)} variant="outline">{t('errorTryAgainTopic', {topic: currentCategoryDetails?.name[locale] || currentTopic})}</Button>
              )}
              <Button onClick={handleNewGame} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('errorChooseNewTopicOrRefresh')}</Button>
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
