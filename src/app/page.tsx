
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestions, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionsInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { getPredefinedQuestion, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import type { CategoryDefinition, DifficultyMode, BilingualText } from "@/types"; 
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from "next-intl";
import type { AppLocale } from "@/lib/i18n-config";
import {
  Loader2,
  AlertTriangle,
  ChevronRight, 
  Zap,
  ShieldQuestion,
  BarChart3,
  SignalLow,
  SignalMedium,
  SignalHigh,
  RotateCcw, 
  Home 
} from "lucide-react";
import { logEvent as logEventFromLib, analytics } from "@/lib/firebase";

type GameState = 'loading_categories' | 'category_selection' | 'difficulty_selection' | 'loading_question' | 'playing' | 'showing_feedback' | 'game_over' | 'error';

type CurrentQuestionData = GenerateTriviaQuestionOutput & { id?: string };

const DIFFICULTY_LEVELS_ORDER: DifficultyLevel[] = ["easy", "medium", "hard"];
const QUESTION_TIME_LIMIT_SECONDS = 30;
const QUESTIONS_PER_GAME = 10; 

export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [appCategories, setAppCategories] = useState<CategoryDefinition[]>([]);
  const [gameState, setGameState] = useState<GameState>('loading_categories');
  const [currentTopic, setCurrentTopic] = useState<string>(''); 
  const [currentCategoryDetails, setCurrentCategoryDetails] = useState<CategoryDefinition | null>(null);
  
  const [questionData, setQuestionData] = useState<CurrentQuestionData | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');
  
  const [askedFirestoreIds, setAskedFirestoreIds] = useState<string[]>([]);
  const [askedQuestionTextsForAI, setAskedQuestionTextsForAI] = useState<string[]>([]);
  const [askedCorrectAnswerTexts, setAskedCorrectAnswerTexts] = useState<string[]>([]);

  const [currentDifficultyLevel, setCurrentDifficultyLevel] = useState<DifficultyLevel>("medium");
  const [selectedDifficultyMode, setSelectedDifficultyMode] = useState<DifficultyMode | null>(null);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isHintVisible, setIsHintVisible] = useState(false);

  const [questionsAnsweredThisGame, setQuestionsAnsweredThisGame] = useState(0);
  const [currentQuestionNumberInGame, setCurrentQuestionNumberInGame] = useState(0);


  const logAnalyticsEvent = useCallback((eventName: string, eventParams?: { [key: string]: any }) => {
    if (analytics) {
      logEventFromLib(eventName, eventParams);
    }
  }, []);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());

    const fetchAndSetCategories = async () => {
      try {
        const allCategories = await getAppCategories();
        const uiCategories = allCategories.filter(cat => cat.isPredefined !== false);
        setAppCategories(uiCategories);

        if (uiCategories.length > 0 || allCategories.length > 0) { 
          setGameState('category_selection');
        } else {
          console.warn("[TriviaPage] No categories defined at all.");
          setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorNoCategoriesDefined'), isCorrect: false });
          setGameState('error');
        }
      } catch (error) {
         console.error("[TriviaPage] Error fetching categories:", error);
         setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
         setGameState('error');
      }
    };
    fetchAndSetCategories();
  }, [t, logAnalyticsEvent]);

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

    logAnalyticsEvent('answer_question', {
      category_topic_value: currentTopic,
      category_name: currentCategoryDetails?.name[locale] || currentTopic,
      question_difficulty: questionData.difficulty,
      is_correct: false,
      timed_out: true,
      question_id: questionData.id
    });

    if (selectedDifficultyMode === "adaptive") {
      const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (currentIndex > 0) {
        setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
      }
    }
    setQuestionsAnsweredThisGame(prev => prev + 1);
    setGameState('showing_feedback');
  }, [questionData, gameState, clearTimer, currentDifficultyLevel, selectedDifficultyMode, locale, t, currentTopic, currentCategoryDetails, logAnalyticsEvent]);


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

  useEffect(() => {
    if (isHintVisible && questionData && gameState === 'playing') {
      logAnalyticsEvent('use_hint', {
        category_topic_value: currentTopic,
        category_name: currentCategoryDetails?.name[locale] || currentTopic,
        question_difficulty: questionData.difficulty,
        question_id: questionData.id
      });
    }
  }, [isHintVisible, questionData, gameState, currentTopic, currentCategoryDetails, locale, logAnalyticsEvent]);


  const fetchQuestion = useCallback(async (topic: string, difficulty: DifficultyLevel, categoryDetailsForSelectedTopic: CategoryDefinition | null) => {
    setGameState('loading_question');
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null); 
    setIsHintVisible(false);

    setCurrentQuestionNumberInGame(prev => prev + 1); // Increment for the question about to be fetched

    let fetchedQuestionData: CurrentQuestionData | null = null;
    
    if (categoryDetailsForSelectedTopic) {
      try {
        fetchedQuestionData = await getPredefinedQuestion(topic, askedFirestoreIds, difficulty);
      } catch (firestoreError) {
        console.warn(`[TriviaPage] Error fetching from Firestore for topic "${topic}", will fall back to Genkit:`, firestoreError);
      }
    }

    if (!fetchedQuestionData) {
      const inputForAI: GenerateTriviaQuestionsInput = {
        topic,
        previousQuestions: askedQuestionTextsForAI, 
        previousCorrectAnswers: askedCorrectAnswerTexts,
        targetDifficulty: difficulty,
        count: 1, 
      };

      if (categoryDetailsForSelectedTopic) { 
        inputForAI.categoryInstructions = categoryDetailsForSelectedTopic.detailedPromptInstructions; 
        if (categoryDetailsForSelectedTopic.difficultySpecificGuidelines && categoryDetailsForSelectedTopic.difficultySpecificGuidelines[difficulty]) {
          inputForAI.difficultySpecificInstruction = categoryDetailsForSelectedTopic.difficultySpecificGuidelines[difficulty]; 
        }
      }
      
      try {
        const newQuestionArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionArray && newQuestionArray.length > 0) {
            fetchedQuestionData = newQuestionArray[0]!; 
        }
      } catch (genkitError) {
        console.error(`[TriviaPage] Failed to generate question with Genkit (topic: ${topic}, difficulty: ${difficulty}):`, genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        return;
      }
    }

    if (fetchedQuestionData) {
      setQuestionData(fetchedQuestionData); 
      const questionTextInLocale = fetchedQuestionData.question[locale] || `q_text_${Date.now()}`;
      const correctAnswerTextInLocale = fetchedQuestionData.answers[fetchedQuestionData.correctAnswerIndex]![locale];

      setAskedQuestionTextsForAI(prev => [...new Set([...prev, questionTextInLocale])]);
      setAskedCorrectAnswerTexts(prev => [...new Set([...prev, correctAnswerTextInLocale])]);

      if (fetchedQuestionData.id) { 
        setAskedFirestoreIds(prev => [...new Set([...prev, fetchedQuestionData!.id!])]);
      }
      setGameState('playing'); 
    } else {
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionForDifficulty', {difficulty: t(`difficultyLevels.${difficulty}` as any) as string }), isCorrect: false });
      setGameState('error');
    }
  }, [locale, askedFirestoreIds, askedQuestionTextsForAI, askedCorrectAnswerTexts, t]); 

  const handleStartGame = async (topicOrTopicValue: string) => {
    let selectedCategoryData = appCategories.find(cat => cat.topicValue === topicOrTopicValue);
    const isCustom = !selectedCategoryData;

    if (isCustom) {
      setCurrentCategoryDetails(null);
      setCurrentTopic(customTopicInput.trim());
    } else {
      setCurrentCategoryDetails(selectedCategoryData!);
      setCurrentTopic(selectedCategoryData!.topicValue);
    }
    
    logAnalyticsEvent('select_category', {
      category_topic_value: isCustom ? customTopicInput.trim() : selectedCategoryData!.topicValue,
      category_name: isCustom ? customTopicInput.trim() : selectedCategoryData!.name[locale],
      is_custom_topic: isCustom
    });
    
    setScore({ correct: 0, incorrect: 0 });
    setAskedFirestoreIds([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0); 
    setCurrentQuestionNumberInGame(0);
    setGameState('difficulty_selection');
  };

  const handleDifficultySelect = (mode: DifficultyMode) => {
    setSelectedDifficultyMode(mode);
    let initialDifficulty: DifficultyLevel;
    if (mode === "adaptive") {
      initialDifficulty = "medium";
    } else {
      initialDifficulty = mode;
    }
    setCurrentDifficultyLevel(initialDifficulty);
    setQuestionsAnsweredThisGame(0); 
    setCurrentQuestionNumberInGame(0);

    logAnalyticsEvent('start_game_with_difficulty', {
      category_topic_value: currentTopic,
      category_name: currentCategoryDetails?.name[locale] || currentTopic,
      difficulty_mode_selected: mode,
      initial_difficulty_level: initialDifficulty
    });

    fetchQuestion(currentTopic, initialDifficulty, currentCategoryDetails);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing') return;

    clearTimer(); 
    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === questionData.correctAnswerIndex;
    const correctAnswerTextInLocale = questionData.answers[questionData.correctAnswerIndex]![locale];
    const explanationInLocale = questionData.explanation[locale];
    
    logAnalyticsEvent('answer_question', {
      category_topic_value: currentTopic,
      category_name: currentCategoryDetails?.name[locale] || currentTopic,
      question_difficulty: questionData.difficulty,
      is_correct: isCorrect,
      timed_out: false,
      question_id: questionData.id
    });
    
    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: explanationInLocale });
      if (selectedDifficultyMode === "adaptive") {
        const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (currentIndex < DIFFICULTY_LEVELS_ORDER.length - 1) {
          setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex + 1]!);
        }
      }
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setFeedback({
        message: t('incorrect'),
        detailedMessage: t('correctAnswerWas', { answer: correctAnswerTextInLocale }),
        isCorrect: false,
        explanation: explanationInLocale
      });
      if (selectedDifficultyMode === "adaptive") {
        const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (currentIndex > 0) {
          setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
        }
      }
    }
    setQuestionsAnsweredThisGame(prev => prev + 1);
    setGameState('showing_feedback');
  };

  const handleNextQuestion = () => {
    if (questionsAnsweredThisGame >= QUESTIONS_PER_GAME) {
      setGameState('game_over');
       logAnalyticsEvent('game_over', {
        category_topic_value: currentTopic,
        category_name: currentCategoryDetails?.name[locale] || currentTopic,
        final_score_correct: score.correct,
        final_score_incorrect: score.incorrect,
        difficulty_mode: selectedDifficultyMode,
        final_difficulty_level: currentDifficultyLevel,
      });
    } else {
      fetchQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
    }
  };

  const handlePlayAgain = () => {
    setScore({ correct: 0, incorrect: 0 });
    setAskedFirestoreIds([]); 
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);
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
    
    setAskedFirestoreIds([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);

    setCurrentDifficultyLevel("medium"); 
    setSelectedDifficultyMode(null); 
    setTimeLeft(null); 
    setIsHintVisible(false);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);
  };
  
  const DifficultyIndicator = () => {
    let Icon = ShieldQuestion; 
    let color = "text-muted-foreground";
    let text = t(`difficultyLevels.${currentDifficultyLevel}` as any); 

    if (selectedDifficultyMode === "adaptive") {
        Icon = Zap; 
        text = `${t('difficultyModeAdaptive')} (${text})`;
    } else {
        const levelIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (levelIndex === 0) { 
            Icon = SignalLow; 
            color = "text-green-500";
        } else if (levelIndex === 1) { 
            Icon = SignalMedium; 
            color = "text-yellow-500";
        } else { 
            Icon = SignalHigh; 
            color = "text-red-500";
        }
    }

    return (
        <div className={`flex items-center text-sm ${color} font-medium`}>
            <Icon className="h-5 w-5 mr-1.5" />
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

      {gameState !== 'category_selection' && gameState !== 'difficulty_selection' && gameState !== 'loading_question' && gameState !== 'loading_categories' && gameState !== 'game_over' && (
        <div className="w-full max-w-2xl mb-4">
           <ScoreDisplay 
             score={score} 
             onNewGame={handleNewGame} 
             currentQuestionNumber={currentQuestionNumberInGame}
             totalQuestionsInGame={QUESTIONS_PER_GAME}
             gameState={gameState}
           />
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
        {gameState === 'category_selection' && (
          <CategorySelector
            predefinedCategories={appCategories}
            customTopicInput={customTopicInput}
            onCustomTopicChange={setCustomTopicInput}
            onSelectTopic={handleStartGame} 
            currentLocale={locale}
          />
        )}
        {gameState === 'difficulty_selection' && (
            <Card className="w-full shadow-xl animate-fadeIn">
                <CardHeader>
                    <CardTitle className="font-headline text-3xl text-center text-primary">{t('selectDifficultyTitle')}</CardTitle>
                    <CardDescription className="text-center">{t('selectDifficultyDescription', { topic: currentCategoryDetails?.name[locale] || currentTopic })}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(["easy", "medium", "hard"] as DifficultyLevel[]).map((level) => {
                        let Icon = SignalMedium;
                        if (level === "easy") Icon = SignalLow;
                        if (level === "hard") Icon = SignalHigh;
                        return (
                            <Button
                                key={level}
                                variant="outline"
                                className="w-full flex items-center justify-center h-16 text-lg group hover:bg-accent hover:text-accent-foreground"
                                onClick={() => handleDifficultySelect(level)}
                            >
                                <Icon className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />
                                {t(`difficultyLevels.${level}` as any)}
                            </Button>
                        );
                     })}
                    <Button
                        variant="outline"
                        className="w-full flex items-center justify-center h-16 text-lg group hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleDifficultySelect("adaptive")}
                    >
                        <Zap className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />
                        {t('difficultyModeAdaptive')}
                    </Button>
                </CardContent>
                 <CardFooter>
                    <Button variant="link" onClick={handleNewGame} className="mx-auto text-sm">
                        {t('backToCategorySelection')}
                    </Button>
                </CardFooter>
            </Card>
        )}
        {gameState === 'loading_question' && (
          <Card className="p-8 text-center animate-fadeIn shadow-xl">
            <CardContent className="flex flex-col items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <p className="mt-6 text-xl font-semibold text-muted-foreground">
                {t('loadingQuestionWithMode', { 
                  topic: currentCategoryDetails?.name[locale] || currentTopic, 
                  difficulty: selectedDifficultyMode === 'adaptive' ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any)
                })}
              </p>
            </CardContent>
          </Card>
        )}
        {(gameState === 'playing' || gameState === 'showing_feedback') && localizedQuestionCardData && questionData && (
          <QuestionCard
            questionData={localizedQuestionCardData}
            onAnswerSelect={handleAnswerSelect}
            onNextQuestion={handleNextQuestion}
            selectedAnswerIndex={selectedAnswerIndex}
            feedback={feedback}
            gameState={gameState}
            timeLeft={timeLeft}
            questionTimeLimitSeconds={QUESTION_TIME_LIMIT_SECONDS}
            onShowHint={() => setIsHintVisible(true)}
            questionId={questionData.id} 
            bilingualQuestionText={questionData.question} 
            categoryTopicValue={currentTopic}
            currentDifficulty={currentDifficultyLevel}
            questionsAnsweredThisGame={questionsAnsweredThisGame}
            totalQuestionsInGame={QUESTIONS_PER_GAME}
          />
        )}
        {gameState === 'game_over' && (
          <Card className="p-6 text-center animate-fadeIn shadow-xl">
            <CardHeader>
              <BarChart3 className="h-16 w-16 text-primary mx-auto mb-4" />
              <CardTitle className="font-headline text-3xl text-primary">{t('gameOverTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xl font-semibold text-muted-foreground">
                {t('gameOverScore', { correct: score.correct, incorrect: score.incorrect, total: QUESTIONS_PER_GAME })}
              </p>
              <p className="text-md text-muted-foreground">
                {t('gameOverTopic', { topic: currentCategoryDetails?.name[locale] || currentTopic, difficulty: selectedDifficultyMode === 'adaptive' ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any) })}
              </p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <Button onClick={handlePlayAgain} variant="outline" className="w-full sm:w-auto">
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('gameOverPlayAgain')}
              </Button>
              <Button onClick={handleNewGame} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
                <Home className="mr-2 h-4 w-4" />
                {t('gameOverNewGame')}
              </Button>
            </CardFooter>
          </Card>
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
                <Button 
                    onClick={() => {
                        setCurrentQuestionNumberInGame(prev => Math.max(0, prev -1)); // Decrement before retry if fetch failed
                        fetchQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
                    }}
                    variant="outline"
                >
                    {t('errorTryAgainTopicWithMode', {
                        topic: currentCategoryDetails?.name[locale] || currentTopic,
                        difficulty: selectedDifficultyMode === 'adaptive' ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any)
                    })}
                </Button>
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
