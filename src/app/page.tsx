
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestions, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionsInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { getPredefinedQuestion, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import type { CategoryDefinition, DifficultyMode } from "@/types"; // Added DifficultyMode
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
  ChevronUp,
  ChevronDown,
  Minus,
  Zap,
  ShieldQuestion,
  BarChart3,
  SignalLow,
  SignalMedium,
  SignalHigh
} from "lucide-react";


type GameState = 'loading_categories' | 'category_selection' | 'difficulty_selection' | 'loading_question' | 'playing' | 'showing_feedback' | 'error';

type CurrentQuestionData = GenerateTriviaQuestionOutput & { id?: string }; // id for Firestore questions

const DIFFICULTY_LEVELS_ORDER: DifficultyLevel[] = ["easy", "medium", "hard"];
const QUESTION_TIME_LIMIT_SECONDS = 30;

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
  
  // State for tracking asked questions
  const [askedFirestoreIds, setAskedFirestoreIds] = useState<string[]>([]); // For Firestore predefined question IDs
  const [askedQuestionTextsForAI, setAskedQuestionTextsForAI] = useState<string[]>([]); // For AI (texts of all questions)
  const [askedCorrectAnswerTexts, setAskedCorrectAnswerTexts] = useState<string[]>([]); // For AI (texts of correct answers)


  const [currentDifficultyLevel, setCurrentDifficultyLevel] = useState<DifficultyLevel>("medium");
  const [selectedDifficultyMode, setSelectedDifficultyMode] = useState<DifficultyMode | null>(null);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());

    const fetchAndSetCategories = async () => {
      try {
        const allCategories = await getAppCategories();
        // Filter categories to show in the UI: only those marked as predefined (or where isPredefined is undefined, defaulting to true)
        const uiCategories = allCategories.filter(cat => cat.isPredefined !== false);
        setAppCategories(uiCategories);
        if (uiCategories.length > 0) {
          setGameState('category_selection');
        } else {
          // If no categories are marked for UI, it could be a configuration issue or intentional.
          // For now, treat as "no categories available for selection".
          console.warn("[TriviaPage] No categories marked for UI display (isPredefined: true). User will only be able to use custom topics or may see an error if none are found at all.");
          setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorNoUICategories'), isCorrect: false });
          // If allCategories is also empty, then it's a more general loading error.
          if (allCategories.length === 0) {
            setGameState('error');
          } else {
             setGameState('category_selection'); // Still allow custom topic input
          }
        }
      } catch (error) {
         console.error("[TriviaPage] Error fetching categories:", error);
         setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
         setGameState('error');
      }
    };
    fetchAndSetCategories();
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

    if (selectedDifficultyMode === "adaptive") {
      const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (currentIndex > 0) {
        setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
      }
    }
    setGameState('showing_feedback');
  }, [questionData, gameState, clearTimer, currentDifficultyLevel, selectedDifficultyMode, locale, t, setScore, setFeedback, setCurrentDifficultyLevel, setGameState, setSelectedAnswerIndex]);


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


  const fetchQuestion = useCallback(async (topic: string, difficulty: DifficultyLevel, categoryDetailsForSelectedTopic: CategoryDefinition | null) => {
    console.log(`[TriviaPage] fetchQuestion called. Topic: "${topic}", Difficulty: "${difficulty}"`);
    console.log(`[TriviaPage] Current askedFirestoreIds count: ${askedFirestoreIds.length}`);
    console.log(`[TriviaPage] Current askedQuestionTextsForAI count: ${askedQuestionTextsForAI.length}`);
    console.log(`[TriviaPage] Current askedCorrectAnswerTexts count: ${askedCorrectAnswerTexts.length}`);

    setGameState('loading_question');
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null); 

    let newQuestionArray: GenerateTriviaQuestionOutput[] | null = null;
    let newQuestionData: CurrentQuestionData | null = null;
    
    // If categoryDetailsForSelectedTopic exists, it means the user selected from the UI (which are all `isPredefined:true` now)
    // OR it's a topic the admin defined in Firestore for which pre-generated questions might exist.
    // The key is, if there's a CategoryDefinition for it, we try Firestore.
    if (categoryDetailsForSelectedTopic) {
      console.log(`[TriviaPage] Attempting to fetch PREDEFINED question for known category "${topic}" (difficulty: ${difficulty}).`);
      try {
        newQuestionData = await getPredefinedQuestion(topic, askedFirestoreIds, difficulty);
        if (newQuestionData) {
          console.log(`[TriviaPage] Successfully fetched PREDEFINED question (ID: ${newQuestionData.id}) for "${topic}".`);
        } else {
          console.log(`[TriviaPage] No UNASKED predefined question found by getPredefinedQuestion for "${topic}" (difficulty: ${difficulty}). Will try AI.`);
        }
      } catch (firestoreError) {
        console.warn(`[TriviaPage] Error fetching from Firestore for topic "${topic}", will fall back to Genkit:`, firestoreError);
      }
    } else {
        console.log(`[TriviaPage] Topic "${topic}" is custom (no categoryDetails). Will use Genkit directly.`);
    }

    if (!newQuestionData) {
      console.log(`[TriviaPage] FALLING BACK to Genkit AI generation for topic "${topic}" (difficulty: ${difficulty}).`);
      const inputForAI: GenerateTriviaQuestionsInput = {
        topic,
        previousQuestions: askedQuestionTextsForAI, 
        previousCorrectAnswers: askedCorrectAnswerTexts,
        targetDifficulty: difficulty,
        count: 1, 
      };

      // If categoryDetailsForSelectedTopic exists (even if no predefined question was found), use its instructions for Genkit
      if (categoryDetailsForSelectedTopic) { 
        inputForAI.categoryInstructions = categoryDetailsForSelectedTopic.detailedPromptInstructions; 
        if (categoryDetailsForSelectedTopic.difficultySpecificGuidelines && categoryDetailsForSelectedTopic.difficultySpecificGuidelines[difficulty]) {
          inputForAI.difficultySpecificInstruction = categoryDetailsForSelectedTopic.difficultySpecificGuidelines[difficulty]; 
        }
      }
      // console.log('[TriviaPage] Input for Genkit AI:', JSON.stringify(inputForAI, null, 2));
      
      try {
        newQuestionArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionArray && newQuestionArray.length > 0) {
            newQuestionData = newQuestionArray[0]!; 
            console.log(`[TriviaPage] Successfully generated question with Genkit for "${topic}". Question: "${newQuestionData.question[locale]?.substring(0,50)}..."`);
        } else {
            console.warn(`[TriviaPage] Genkit returned no questions for topic "${topic}" (difficulty: ${difficulty}).`);
        }
      } catch (genkitError) {
        console.error(`[TriviaPage] Failed to generate question with Genkit (topic: ${topic}, difficulty: ${difficulty}):`, genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        return;
      }
    }

    if (newQuestionData) {
      setQuestionData(newQuestionData as CurrentQuestionData); 
      const questionTextInLocale = newQuestionData.question[locale] || `q_text_${Date.now()}`;
      const correctAnswerTextInLocale = newQuestionData.answers[newQuestionData.correctAnswerIndex]![locale];

      setAskedQuestionTextsForAI(prev => [...new Set([...prev, questionTextInLocale])]);
      console.log(`[TriviaPage] Added question text to askedQuestionTextsForAI: "${questionTextInLocale.substring(0,50)}..."`);
      
      setAskedCorrectAnswerTexts(prev => [...new Set([...prev, correctAnswerTextInLocale])]);
      console.log(`[TriviaPage] Added correct answer to askedCorrectAnswerTexts: "${correctAnswerTextInLocale}"`);

      if ((newQuestionData as CurrentQuestionData).id) { // Predefined question with Firestore ID
        setAskedFirestoreIds(prev => [...new Set([...prev, (newQuestionData as CurrentQuestionData).id!])]);
        console.log(`[TriviaPage] Added PREDEFINED question ID to askedFirestoreIds: "${(newQuestionData as CurrentQuestionData).id!}"`);
      }
      setGameState('playing'); 
    } else {
      console.warn(`[TriviaPage] NO QUESTION DATA (neither predefined nor AI) for topic "${topic}", difficulty "${difficulty}". Setting error state.`);
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionForDifficulty', {difficulty: t(`difficultyLevels.${difficulty}` as any) as string }), isCorrect: false });
      setGameState('error');
    }
  }, [locale, askedFirestoreIds, askedQuestionTextsForAI, askedCorrectAnswerTexts, t]); 

  const handleStartGame = async (topicOrTopicValue: string) => {
    console.log(`[TriviaPage] handleStartGame called with topicValue: "${topicOrTopicValue}"`);
    
    // Check if it's one of the categories fetched for the UI (which are filtered by isPredefined: true)
    let selectedCategoryData = appCategories.find(cat => cat.topicValue === topicOrTopicValue);

    if (!selectedCategoryData) {
      // If not found in UI categories, it might be a custom topic or a category from Firestore not marked for UI.
      // For custom topics, categoryDetails will be null. For others, we could try fetching it.
      // For simplicity, if it's not in appCategories (UI list), treat it as a custom topic if it's not from the form.
      // The CategorySelector passes topicValue. If it's not in appCategories, it must be customTopicInput.
      // This logic assumes `onSelectTopic` from CategorySelector passes `topicValue` for predefined, and `customTopicInput` for custom.
       if (topicOrTopicValue === customTopicInput.trim()) {
         console.log(`[TriviaPage] Topic "${topicOrTopicValue}" is being treated as custom (matches customTopicInput).`);
         setCurrentCategoryDetails(null); // It's a truly custom topic
       } else {
          // This case should ideally not happen if CategorySelector only shows filtered appCategories.
          // However, to be robust, if it's not customTopicInput, we might assume it's a topicValue for a category
          // that *exists* in Firestore but isn't in the UI list. We'd need to fetch its details.
          // For now, we'll simplify: if not in `appCategories` (UI list), it's custom or we can't get details easily here.
          // The script `populate-firestore-questions.ts` works with ALL categories from Firestore.
          // The game page.tsx should primarily use categories intended for the UI.
          // Let's fetch all categories once to get details if needed, but only show `isPredefined:true` ones.
          // Better: currentCategoryDetails passed to fetchQuestion will get all its data from Firestore if it exists.
          // We need to ensure `currentCategoryDetails` is set correctly for *any* known category.
          // For topics selected from the list, `selectedCategoryData` will have the details.
          // For custom topics, `selectedCategoryData` will be null.
          // Let's ensure currentCategoryDetails is based on a fresh full fetch if topic not in UI list.
          const allCategories = await getAppCategories(); // Fetch all, not just UI ones
          selectedCategoryData = allCategories.find(cat => cat.topicValue === topicOrTopicValue) || null;
          console.log(`[TriviaPage] Topic "${topicOrTopicValue}" not in UI list. Fetched from all categories. Found: ${!!selectedCategoryData}`);
          setCurrentCategoryDetails(selectedCategoryData);
       }
    } else {
        setCurrentCategoryDetails(selectedCategoryData);
    }
    
    setCurrentTopic(topicOrTopicValue); 
    
    setScore({ correct: 0, incorrect: 0 });
    setAskedFirestoreIds([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    console.log('[TriviaPage] Score, askedFirestoreIds, askedQuestionTextsForAI, and askedCorrectAnswerTexts RESET for new game.');
    setGameState('difficulty_selection');
  };

  const handleDifficultySelect = (mode: DifficultyMode) => {
    console.log(`[TriviaPage] handleDifficultySelect called with mode: "${mode}" for topic: "${currentTopic}"`);
    setSelectedDifficultyMode(mode);
    let initialDifficulty: DifficultyLevel;
    if (mode === "adaptive") {
      initialDifficulty = "medium";
    } else {
      initialDifficulty = mode;
    }
    setCurrentDifficultyLevel(initialDifficulty);
    console.log(`[TriviaPage] Initial difficulty set to: "${initialDifficulty}"`);
    fetchQuestion(currentTopic, initialDifficulty, currentCategoryDetails);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing') return;
    console.log(`[TriviaPage] handleAnswerSelect: User selected answer index ${answerIndex}. Correct index: ${questionData.correctAnswerIndex}`);

    clearTimer(); 
    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === questionData.correctAnswerIndex;
    const correctAnswerTextInLocale = questionData.answers[questionData.correctAnswerIndex]![locale];
    const explanationInLocale = questionData.explanation[locale];
    
    if (isCorrect) {
      console.log('[TriviaPage] Answer was CORRECT.');
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: explanationInLocale });
      if (selectedDifficultyMode === "adaptive") {
        const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (currentIndex < DIFFICULTY_LEVELS_ORDER.length - 1) {
          const newDifficulty = DIFFICULTY_LEVELS_ORDER[currentIndex + 1]!;
          console.log(`[TriviaPage] Adaptive difficulty: Correct answer, increasing difficulty from ${currentDifficultyLevel} to ${newDifficulty}`);
          setCurrentDifficultyLevel(newDifficulty);
        } else {
          console.log('[TriviaPage] Adaptive difficulty: Correct answer, already at max difficulty.');
        }
      }
    } else {
      console.log('[TriviaPage] Answer was INCORRECT.');
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
           const newDifficulty = DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!;
           console.log(`[TriviaPage] Adaptive difficulty: Incorrect answer, decreasing difficulty from ${currentDifficultyLevel} to ${newDifficulty}`);
          setCurrentDifficultyLevel(newDifficulty);
        } else {
            console.log('[TriviaPage] Adaptive difficulty: Incorrect answer, already at min difficulty.');
        }
      }
    }
    setGameState('showing_feedback');
  };

  const handleNextQuestion = () => {
    console.log(`[TriviaPage] handleNextQuestion called. Next question will be difficulty: "${currentDifficultyLevel}" for topic: "${currentTopic}"`);
    fetchQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
  };

  const handleNewGame = () => {
    console.log('[TriviaPage] handleNewGame called. Resetting game state.');
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
    console.log('[TriviaPage] All states reset for new game, including all asked question tracking arrays.');
  };
  
  const DifficultyIndicator = () => {
    let Icon = Minus;
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

      {gameState !== 'category_selection' && gameState !== 'difficulty_selection' && gameState !== 'loading_question' && gameState !== 'loading_categories' && (
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
        {gameState === 'category_selection' && ( // appCategories is already filtered
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
                <Button 
                    onClick={() => fetchQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails)} 
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

