
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestions, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionsInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { validateCustomTopic, type ValidateCustomTopicOutput } from "@/ai/flows/validate-custom-topic";
import { getPredefinedQuestionFromFirestore, getAllQuestionsForTopic, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import { addGameSession } from "@/services/gameSessionService";
import {
  saveQuestionsToDB, getQuestionFromDB, clearAllQuestionsFromDB,
  saveCategoriesToCache, getCategoriesFromCache, clearCategoriesCache,
  saveCustomQuestionsToDB, getCustomQuestionFromDB, clearAllCustomQuestionsFromDB,
  saveCustomTopicMeta, getCustomTopicsMeta, clearAllCustomTopicsMeta, deleteCustomTopicAndQuestions,
  type CustomTopicMeta, type CustomQuestion,
  CONTENT_VERSION_STORAGE_KEY, DOWNLOADED_TOPICS_STORAGE_KEY, CURRENT_CONTENT_VERSION
} from "@/services/indexedDBService";
import type { CategoryDefinition, DifficultyMode, BilingualText } from "@/types";
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/lib/i18n-config';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from 'next/link';
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
  Home,
  DownloadCloud,
  ArrowLeft,
  Sparkles,
  ThumbsDown,
  ScrollText,
  ListChecks,
  LogIn,
  LogOut,
  UserCircle,
  LayoutDashboard,
  User
} from "lucide-react";
import { logEvent as logEventFromLib } from "@/lib/firebase";

type GameState =
  'initial_loading' |
  'category_selection' |
  'validating_custom_topic' |
  'confirming_custom_topic' |
  'difficulty_selection' |
  'loading_question' | // Repurposed for batch loading & preloading
  'loading_custom_batch' |
  'downloading_category_questions' |
  'playing' |
  'showing_feedback' |
  'game_over' |
  'error';

interface ActiveCategoryDetails {
  id: string;
  topicValue: string;
  name: BilingualText;
  icon: string;
  detailedPromptInstructions: string;
  parentTopicValue?: string;
  difficultySpecificGuidelines?: {
      [key in DifficultyLevel]?: string;
  };
  isCustomActive: boolean;
  isVisual?: boolean;
}

type GameQuestion = PredefinedQuestion | CustomQuestion;

const DIFFICULTY_LEVELS_ORDER: DifficultyLevel[] = ["easy", "medium", "hard"];
const QUESTION_TIME_LIMIT_SECONDS = 30;
const QUESTIONS_PER_GAME = 10;
const CUSTOM_TOPIC_QUESTIONS_TO_GENERATE = 30;
const DEFAULT_MODEL_FOR_GAME = 'googleai/gemini-2.5-flash';

const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j]!, newArray[i]!];
  }
  return newArray;
};

export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();
  const { user, userProfile, loading: authLoading, signOut } = useAuth();

  const [allAppCategories, setAllAppCategories] = useState<CategoryDefinition[]>([]);
  const [topLevelCategories, setTopLevelCategories] = useState<CategoryDefinition[]>([]);
  const [categoriesForCurrentView, setCategoriesForCurrentView] = useState<CategoryDefinition[]>([]);
  const [currentBreadcrumb, setCurrentBreadcrumb] = useState<CategoryDefinition[]>([]);
  
  const [gameState, setGameState] = useState<GameState>('initial_loading');

  // Game session state
  const [gameSessionQuestions, setGameSessionQuestions] = useState<GameQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [currentTopicValue, setCurrentTopicValue] = useState<string>('');
  const [currentCategoryDetails, setCurrentCategoryDetails] = useState<ActiveCategoryDetails | null>(null);

  // Current question state
  const [questionData, setQuestionData] = useState<GameQuestion | null>(null);
  const [shuffledAnswers, setShuffledAnswers] = useState<BilingualText[]>([]);
  const [currentCorrectShuffledIndex, setCurrentCorrectShuffledIndex] = useState<number | null>(null);

  // UI/Interaction state
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');

  // History and tracking state
  const [askedQuestionIdsFromDB, setAskedQuestionIdsFromDB] = useState<string[]>([]);
  const [askedQuestionTextsForAI, setAskedQuestionTextsForAI] = useState<string[]>([]);
  const [askedCorrectAnswerTexts, setAskedCorrectAnswerTexts] = useState<string[]>([]);

  // Difficulty and timer state
  const [currentDifficultyLevel, setCurrentDifficultyLevel] = useState<DifficultyLevel>("medium");
  const [selectedDifficultyMode, setSelectedDifficultyMode] = useState<DifficultyMode | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isHintVisible, setIsHintVisible] = useState(false);

  // Cache and download state
  const [downloadedPredefinedTopicValues, setDownloadedPredefinedTopicValues] = useState<Set<string>>(new Set());
  const [userGeneratedCustomTopics, setUserGeneratedCustomTopics] = useState<CustomTopicMeta[]>([]);

  // Custom topic flow state
  const [isCustomTopicValidating, setIsCustomTopicValidating] = useState(false);
  const [customTopicToConfirm, setCustomTopicToConfirm] = useState<{
    name: BilingualText;
    instructions: string;
    originalInput: string;
  } | null>(null);

  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const correctSoundRef = useRef<HTMLAudioElement | null>(null);
  const wrongSoundRef = useRef<HTMLAudioElement | null>(null);

  const logAnalyticsEvent = useCallback((eventName: string, eventParams?: { [key: string]: any }) => {
    logEventFromLib(eventName, eventParams);
  }, []);

  useEffect(() => {
    const performInitialSetup = async () => {
      setGameState('initial_loading');
      let localDownloadedPredefinedTopics: Set<string> = new Set();
      let storedContentVersion: string | null = null;

      if (typeof window !== 'undefined') {
        storedContentVersion = localStorage.getItem(CONTENT_VERSION_STORAGE_KEY);
        const storedTopicsString = localStorage.getItem(DOWNLOADED_TOPICS_STORAGE_KEY);
        if (storedTopicsString) {
          try {
            localDownloadedPredefinedTopics = new Set(JSON.parse(storedTopicsString));
          } catch (e) { console.error("Error parsing downloaded predefined topics", e); localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY); }
        }
      }

      if (storedContentVersion !== CURRENT_CONTENT_VERSION) {
        if (typeof window !== 'undefined' && window.indexedDB) {
          try {
            await clearAllQuestionsFromDB();
            await clearCategoriesCache();
            await clearAllCustomQuestionsFromDB();
            await clearAllCustomTopicsMeta();
            localStorage.setItem(CONTENT_VERSION_STORAGE_KEY, CURRENT_CONTENT_VERSION);
            localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY);
            localDownloadedPredefinedTopics = new Set();
            toast({ title: t('toastSuccessTitle') as string, description: t('offlineContentVersionUpdated')});
          } catch (error) {
            toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('offlineContentUpdateError') });
          }
        }
      }
      setDownloadedPredefinedTopicValues(localDownloadedPredefinedTopics);

      try {
        const customMetas = await getCustomTopicsMeta();
        setUserGeneratedCustomTopics(customMetas);
      } catch (error) { console.error("Error loading custom topics metadata:", error); }

      let categoriesToUse: CategoryDefinition[] | null = null;
      try {
        const cachedCategoriesData = await getCategoriesFromCache();
        if (cachedCategoriesData && storedContentVersion === CURRENT_CONTENT_VERSION) {
          categoriesToUse = cachedCategoriesData.categories;
        } else {
          categoriesToUse = await getAppCategories();
          if (categoriesToUse && categoriesToUse.length > 0) {
            await saveCategoriesToCache(categoriesToUse);
          }
        }

        if (categoriesToUse && categoriesToUse.length > 0) {
          setAllAppCategories(categoriesToUse);
          const topLevels = categoriesToUse.filter(cat => !cat.parentTopicValue);
          setTopLevelCategories(topLevels);
          setCategoriesForCurrentView(topLevels);
          setGameState('category_selection');
        } else {
          setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorNoCategoriesDefined'), isCorrect: false });
          setGameState('error');
        }
      } catch (error) {
        setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
        setGameState('error');
      }
    };

    performInitialSetup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const isGameActive = ['loading_question', 'playing', 'showing_feedback'].includes(gameState);
    if (isGameActive) {
      if (audio.paused) {
        audio.loop = true;
        audio.play().catch(error => console.warn("Audio playback failed:", error));
      }
    } else {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }, [gameState]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => { if (audio) { audio.pause(); audio.currentTime = 0; } };
  }, []);

  const downloadQuestionsForTopic = async (categoryToDownload: CategoryDefinition): Promise<boolean> => {
    if (downloadedPredefinedTopicValues.has(categoryToDownload.topicValue) && localStorage.getItem(CONTENT_VERSION_STORAGE_KEY) === CURRENT_CONTENT_VERSION) {
      return true;
    }
    setGameState('downloading_category_questions');
    try {
      const questions = await getAllQuestionsForTopic(categoryToDownload.topicValue);
      if (questions.length > 0) { await saveQuestionsToDB(questions); }
      const newDownloadedTopics = new Set(downloadedPredefinedTopicValues).add(categoryToDownload.topicValue);
      setDownloadedPredefinedTopicValues(newDownloadedTopics);
      if(typeof window !== 'undefined') {
        localStorage.setItem(DOWNLOADED_TOPICS_STORAGE_KEY, JSON.stringify(Array.from(newDownloadedTopics)));
      }
      if (questions.length > 0) {
        toast({ title: t('toastSuccessTitle') as string, description: t('categoryDownloadComplete', { categoryName: categoryToDownload.name[locale] }) });
      }
      return true;
    } catch (error) {
      toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }) });
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }), isCorrect: false });
      return false;
    }
  };

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

  const prepareAndSetQuestion = useCallback((qData: GameQuestion) => {
    setQuestionData(qData);
    const allAnswers = [qData.correctAnswer, ...qData.distractors];
    const shuffled = shuffleArray(allAnswers);
    const newCorrectIndex = shuffled.findIndex(ans => ans.en === qData.correctAnswer.en && ans.es === qData.correctAnswer.es);
    setShuffledAnswers(shuffled);
    setCurrentCorrectShuffledIndex(newCorrectIndex);
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null);
    setIsHintVisible(false);
    setGameState('playing');
  }, []);

  const handleTimeout = useCallback(() => {
    if (!questionData || gameState !== 'playing') return;
    clearTimer();
    wrongSoundRef.current?.play();
    setSelectedAnswerIndex(null);
    setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));

    const correctAnswerText = questionData.correctAnswer[locale] ?? t('errorLoadingQuestionDetail');
    const explanationText = questionData.explanation?.[locale] ?? '';
    setFeedback({ message: t('timesUp'), detailedMessage: t('correctAnswerWas', { answer: correctAnswerText }), isCorrect: false, explanation: explanationText });
    logAnalyticsEvent('answer_question', { category_topic_value: currentTopicValue, question_difficulty: questionData.difficulty, is_correct: false, timed_out: true, question_id: questionData.id, is_custom_topic: currentCategoryDetails?.isCustomActive || false });
    if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
      const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (currentIndex > 0) { setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!); }
    }
    setGameState('showing_feedback');
  }, [questionData, gameState, clearTimer, currentDifficultyLevel, selectedDifficultyMode, locale, t, currentTopicValue, currentCategoryDetails, logAnalyticsEvent]);

  useEffect(() => {
    if (timeLeft === 0 && gameState === 'playing') { handleTimeout(); }
  }, [timeLeft, gameState, handleTimeout]);

  useEffect(() => {
    if (gameState === 'playing' && questionData) { startTimer(); } 
    else { clearTimer(); setTimeLeft(null); }
    return () => clearTimer();
  }, [gameState, questionData, startTimer, clearTimer]);

  useEffect(() => {
    if (isHintVisible && questionData && gameState === 'playing') {
      logAnalyticsEvent('use_hint', { category_topic_value: currentTopicValue, question_difficulty: questionData.difficulty, question_id: questionData.id, is_custom_topic: currentCategoryDetails?.isCustomActive || false });
    }
  }, [isHintVisible, questionData, gameState, currentTopicValue, currentCategoryDetails, logAnalyticsEvent]);

  const fetchGameBatch = useCallback(async (
    topicVal: string, difficulty: DifficultyLevel, isCustom: boolean, totalQuestions: number
  ): Promise<GameQuestion[]> => {
    const batch: GameQuestion[] = [];
    const tempAskedIds = new Set<string>(askedQuestionIdsFromDB);

    for (let i = 0; i < totalQuestions; i++) {
      let question: GameQuestion | null = null;
      if (isCustom) {
        question = await getCustomQuestionFromDB(topicVal, difficulty, Array.from(tempAskedIds));
      } else {
        question = await getQuestionFromDB(topicVal, difficulty, Array.from(tempAskedIds));
      }

      if (question && question.id) {
        batch.push(question);
        tempAskedIds.add(question.id);
      } else {
        break; // Stop if we can't find more unique questions
      }
    }
    return batch;
  }, [askedQuestionIdsFromDB]);

  const preloadImages = useCallback(async (questions: GameQuestion[]): Promise<void> => {
    const imagePromises = questions
      .filter(q => q.imageUrl)
      .map(q => new Promise<void>((resolve) => {
        const img = new Image();
        img.src = q.imageUrl!;
        img.onload = () => resolve();
        img.onerror = () => {
          console.warn(`Failed to preload image: ${q.imageUrl}`);
          resolve(); // Resolve anyway to not block the game
        };
      }));

    if (imagePromises.length > 0) { await Promise.all(imagePromises); }
  }, []);

  const prepareAndStartGame = useCallback(async (topicVal: string, difficulty: DifficultyLevel, activeCatDetails: ActiveCategoryDetails) => {
    setGameState('loading_question');
    const isCustom = activeCatDetails.isCustomActive;
    
    // Initial AI generation for new custom topics
    if (isCustom) {
      const existingQuestions = await getCustomQuestionFromDB(topicVal, difficulty, []);
      if (!existingQuestions) {
        setGameState('loading_custom_batch');
        try {
          const newQuestionsArray = await generateTriviaQuestions({
            topic: activeCatDetails.name.en,
            previousQuestions: [], previousCorrectAnswers: [],
            targetDifficulty: difficulty, count: CUSTOM_TOPIC_QUESTIONS_TO_GENERATE,
            modelName: DEFAULT_MODEL_FOR_GAME, categoryInstructions: activeCatDetails.detailedPromptInstructions,
          });
          if (newQuestionsArray && newQuestionsArray.length > 0) {
            await saveCustomQuestionsToDB(newQuestionsArray.map(q => ({ ...q, id: crypto.randomUUID(), customTopicValue: topicVal })));
          } else {
            setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionsForCustomTopic'), isCorrect: false });
            setGameState('error');
            return;
          }
        } catch (error) {
          setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
          setGameState('error');
          return;
        }
      }
    }
    
    setGameState('loading_question');
    const questionBatch = await fetchGameBatch(topicVal, difficulty, isCustom, QUESTIONS_PER_GAME);

    if (questionBatch.length === 0) {
      const errorDetailKey = isCustom ? 'errorNoMoreQuestionsForCustomTopicDifficulty' : 'errorNoQuestionForDifficulty';
      setFeedback({
        message: t('errorLoadingQuestion'),
        detailedMessage: t(errorDetailKey, { difficulty: t(`difficultyLevels.${difficulty}` as any) as string, topic: activeCatDetails.name[locale] || topicVal }),
        isCorrect: false
      });
      setGameState('error');
      return;
    }

    await preloadImages(questionBatch);
    setGameSessionQuestions(questionBatch);
    setAskedQuestionIdsFromDB(prev => [...new Set([...prev, ...questionBatch.map(q => q.id!).filter(Boolean)])]);
    setCurrentQuestionIndex(0);
    prepareAndSetQuestion(questionBatch[0]!);
  }, [t, locale, fetchGameBatch, preloadImages, prepareAndSetQuestion]);

  const handleDifficultySelect = async (mode: DifficultyMode) => {
    if (!currentCategoryDetails) return;
    setSelectedDifficultyMode(mode);
    const isCustom = currentCategoryDetails.isCustomActive;
    const initialDifficulty: DifficultyLevel = isCustom ? (mode as DifficultyLevel) : (mode === "adaptive" ? "medium" : mode);
    setCurrentDifficultyLevel(initialDifficulty);
    logAnalyticsEvent('start_game_with_difficulty', { category_topic_value: currentTopicValue, difficulty_mode_selected: mode, initial_difficulty_level: initialDifficulty, is_custom_topic: isCustom });
    prepareAndStartGame(currentTopicValue, initialDifficulty, currentCategoryDetails);
  };

  const handleNextQuestion = () => {
    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < gameSessionQuestions.length) {
        setCurrentQuestionIndex(nextIndex);
        prepareAndSetQuestion(gameSessionQuestions[nextIndex]!);
    } else {
        setGameState('game_over');
        logAnalyticsEvent('game_over', { category_topic_value: currentTopicValue, final_score_correct: score.correct, final_score_incorrect: score.incorrect, difficulty_mode: selectedDifficultyMode, is_custom_topic: currentCategoryDetails?.isCustomActive || false });
        if (user && currentCategoryDetails && selectedDifficultyMode) {
          addGameSession({
            userId: user.uid, categoryTopicValue: currentTopicValue, categoryName: currentCategoryDetails.name,
            difficultyMode: selectedDifficultyMode, finalScoreCorrect: score.correct, finalScoreIncorrect: score.incorrect,
            totalQuestions: gameSessionQuestions.length, isCustomTopic: currentCategoryDetails.isCustomActive,
          }).catch(err => console.error("Failed to save game session:", err));
        }
    }
  };

  const handlePlayAgainSameSettings = async () => {
    setScore({ correct: 0, incorrect: 0 });
    setGameSessionQuestions([]);
    if (selectedDifficultyMode && currentCategoryDetails) {
      const isCustom = currentCategoryDetails.isCustomActive;
      const initialDifficulty = isCustom ? (selectedDifficultyMode as DifficultyLevel) : (selectedDifficultyMode === "adaptive" ? "medium" : selectedDifficultyMode);
      prepareAndStartGame(currentTopicValue, initialDifficulty, currentCategoryDetails);
    }
  };
  
  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing' || currentCorrectShuffledIndex === null) return;
    clearTimer();
    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === currentCorrectShuffledIndex;
    const correctAnswerTextInLocale = questionData.correctAnswer[locale];
    const explanationInLocale = questionData.explanation[locale];
    logAnalyticsEvent('answer_question', { category_topic_value: currentTopicValue, question_difficulty: questionData.difficulty, is_correct: isCorrect, timed_out: false, question_id: questionData.id, is_custom_topic: currentCategoryDetails?.isCustomActive || false });
    if (isCorrect) {
      correctSoundRef.current?.play();
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: explanationInLocale });
      if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
        const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (currentIndex < DIFFICULTY_LEVELS_ORDER.length - 1) { setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex + 1]!); }
      }
    } else {
      wrongSoundRef.current?.play();
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setFeedback({ message: t('incorrect'), detailedMessage: t('correctAnswerWas', { answer: correctAnswerTextInLocale }), isCorrect: false, explanation: explanationInLocale });
      if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
        const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (currentIndex > 0) { setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!); }
      }
    }
    setGameState('showing_feedback');
  };

  const resetGameToBase = () => {
    setGameState('category_selection');
    setCategoriesForCurrentView(topLevelCategories);
    setCurrentBreadcrumb([]);
    setScore({ correct: 0, incorrect: 0 });
    setQuestionData(null);
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setCurrentTopicValue('');
    setCustomTopicInput('');
    setCurrentCategoryDetails(null);
    setAskedQuestionIdsFromDB([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setCurrentDifficultyLevel("medium");
    setSelectedDifficultyMode(null);
    setGameSessionQuestions([]);
    setCurrentQuestionIndex(0);
    setTimeLeft(null);
    setIsHintVisible(false);
    setCustomTopicToConfirm(null);
    setIsCustomTopicValidating(false);
    getCustomTopicsMeta().then(setUserGeneratedCustomTopics).catch(e => console.error("Error reloading custom topics meta on full reset", e));
  };
  
  // Handlers for category navigation and selection
  const handleCategoryClick = async (category: CategoryDefinition) => {
    const children = allAppCategories.filter(cat => cat.parentTopicValue === category.topicValue);
    resetGameToBase();
    if (children.length > 0) {
        setCurrentBreadcrumb(prev => [...prev, category]);
        setCategoriesForCurrentView(children);
    } else {
        const downloadSuccess = await downloadQuestionsForTopic(category);
        if (!downloadSuccess) { setGameState('category_selection'); return; }
        setCurrentTopicValue(category.topicValue);
        setCurrentCategoryDetails({...category, isCustomActive: false });
        setCurrentBreadcrumb(prev => [...prev, category]);
        setGameState('difficulty_selection');
        logAnalyticsEvent('select_category', { category_topic_value: category.topicValue, is_custom_topic: false });
    }
  };

  const handleUserGeneratedCustomTopicSelect = async (customTopicMeta: CustomTopicMeta) => {
    resetGameToBase();
    setCurrentTopicValue(customTopicMeta.customTopicValue);
    setCurrentCategoryDetails({
      id: customTopicMeta.customTopicValue, topicValue: customTopicMeta.customTopicValue,
      name: customTopicMeta.name, icon: customTopicMeta.icon || 'Sparkles',
      detailedPromptInstructions: customTopicMeta.detailedPromptInstructions, isCustomActive: true,
    });
    setGameState('difficulty_selection');
    logAnalyticsEvent('select_category', { category_topic_value: customTopicMeta.customTopicValue, is_custom_topic: true, is_saved_custom_topic: true });
  };
  
  const handleDeleteCustomTopic = async (topicValueToDelete: string) => {
    try {
      await deleteCustomTopicAndQuestions(topicValueToDelete);
      setUserGeneratedCustomTopics(prev => prev.filter(topic => topic.customTopicValue !== topicValueToDelete));
      toast({ title: t('toastSuccessTitle') as string, description: t('customTopicDeletedSuccess'), });
    } catch (error) { toast({ variant: 'destructive', title: t('toastErrorTitle') as string, description: t('customTopicDeletedError'), }); }
  };

  const handleCustomTopicFormSubmit = async (rawTopic: string) => {
    if (!rawTopic.trim()) return;
    setIsCustomTopicValidating(true);
    setGameState('validating_custom_topic');
    try {
      const validationResult = await validateCustomTopic({ rawTopic, currentLocale: locale });
      if (validationResult.isValid && validationResult.refinedTopicName && validationResult.detailedPromptInstructions) {
        setCustomTopicToConfirm({ name: validationResult.refinedTopicName, instructions: validationResult.detailedPromptInstructions, originalInput: rawTopic });
        setGameState('confirming_custom_topic');
      } else {
        toast({ variant: "destructive", title: t('customTopicRejectedTitle'), description: validationResult.rejectionReason || t('customTopicRejectedDefaultReason'), });
        setGameState('category_selection');
      }
    } catch (error) {
      toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('customTopicValidationError'), });
      setGameState('category_selection');
    } finally { setIsCustomTopicValidating(false); }
  };

  const handleConfirmCustomTopic = async () => {
    if (!customTopicToConfirm) return;
    const generatedCustomTopicValue = customTopicToConfirm.name.en.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
    const newMeta: CustomTopicMeta = { customTopicValue: generatedCustomTopicValue, name: customTopicToConfirm.name, detailedPromptInstructions: customTopicToConfirm.instructions, createdAt: Date.now(), icon: 'Sparkles' };
    try {
        await saveCustomTopicMeta(newMeta);
        setUserGeneratedCustomTopics(prev => [newMeta, ...prev.sort((a,b) => b.createdAt - a.createdAt)]);
    } catch (error) {
        toast({variant: 'destructive', title: t('toastErrorTitle') as string, description: t('customTopicStorageError')});
        setGameState('category_selection');
        return;
    }
    resetGameToBase();
    setCurrentTopicValue(newMeta.customTopicValue);
    setCurrentCategoryDetails({ ...newMeta, id: newMeta.customTopicValue, topicValue: newMeta.customTopicValue, isCustomActive: true });
    setGameState('difficulty_selection');
    setCustomTopicToConfirm(null);
    setCustomTopicInput('');
    logAnalyticsEvent('select_category', { category_topic_value: newMeta.customTopicValue, is_custom_topic: true, is_newly_created_custom_topic: true, original_user_input: customTopicToConfirm.originalInput });
  };

  const DifficultyIndicator = () => {
    let Icon = ShieldQuestion;
    let color = "text-muted-foreground";
    let text = t(`difficultyLevels.${currentDifficultyLevel}` as any);

    if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
      Icon = Zap;
      text = `${t('difficultyModeAdaptive')} (${text})`;
    } else if (selectedDifficultyMode) {
      const levelIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (levelIndex === 0) { Icon = SignalLow; color = "text-green-500"; }
      else if (levelIndex === 1) { Icon = SignalMedium; color = "text-yellow-500"; }
      else { Icon = SignalHigh; color = "text-red-500"; }
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
    answers: shuffledAnswers.map(ans => ans[locale]),
    correctAnswerIndex: currentCorrectShuffledIndex ?? 0, 
    explanation: questionData.explanation[locale],
    difficulty: questionData.difficulty,
    hint: questionData.hint?.[locale],
    imageUrl: questionData.imageUrl,
  } : null;

  const renderContent = () => {
    switch(gameState) {
      case 'initial_loading':
        return (
          <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen text-foreground">
            <Card className="p-8 text-center shadow-xl max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                <p className="mt-4 text-xl font-semibold text-muted-foreground">{t('initialLoadingMessage')}</p>
              </CardContent>
            </Card>
          </div>
        );

      case 'downloading_category_questions':
      case 'validating_custom_topic':
      case 'loading_custom_batch': {
        let loadingTextKey: 'downloadingCategoryQuestions' | 'validatingCustomTopic' | 'loadingCustomBatch';
        let loadingVars: any = {};
        
        switch (gameState) {
          case 'downloading_category_questions':
            loadingTextKey = 'downloadingCategoryQuestions';
            loadingVars = { categoryName: currentCategoryDetails?.name[locale] || '...' };
            break;
          case 'validating_custom_topic':
            loadingTextKey = 'validatingCustomTopic';
            break;
          case 'loading_custom_batch':
            loadingTextKey = 'loadingCustomBatch';
            loadingVars = { 
              count: CUSTOM_TOPIC_QUESTIONS_TO_GENERATE, 
              topic: customTopicToConfirm?.name[locale] || currentCategoryDetails?.name[locale] || '...',
              difficulty: t(`difficultyLevels.${currentDifficultyLevel}` as any) 
            };
            break;
        }

        return (
          <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen text-foreground">
            <Card className="p-8 text-center shadow-xl max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center">
                { gameState === 'downloading_category_questions' ? <DownloadCloud className="h-16 w-16 text-primary mx-auto mb-4" /> : <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" /> }
                <p className="mt-4 text-xl font-semibold text-muted-foreground">{t(loadingTextKey, loadingVars)}</p>
              </CardContent>
            </Card>
          </div>
        );
      }

      case 'category_selection':
        return (
          <CategorySelector
            categoriesToDisplay={categoriesForCurrentView}
            currentParent={currentBreadcrumb.length > 0 ? currentBreadcrumb.at(-1) : null}
            customTopicInput={customTopicInput}
            onCustomTopicChange={setCustomTopicInput}
            onSelectCategory={handleCategoryClick}
            onCustomTopicSubmit={handleCustomTopicFormSubmit}
            onPlayParentCategory={currentBreadcrumb.length > 0 ? async () => { const parentCategory = currentBreadcrumb.at(-1); if (parentCategory) { resetGameToBase(); const ds = await downloadQuestionsForTopic(parentCategory); if(ds) { setCurrentTopicValue(parentCategory.topicValue); setCurrentCategoryDetails({...parentCategory, isCustomActive: false }); setGameState('difficulty_selection'); logAnalyticsEvent('select_category', { category_topic_value: parentCategory.topicValue, is_custom_topic: false, played_as_parent: true }); } } } : undefined}
            onGoBack={currentBreadcrumb.length > 0 ? () => { if (currentBreadcrumb.length <= 1) { setCurrentBreadcrumb([]); setCategoriesForCurrentView(topLevelCategories); } else { const newBreadcrumb = currentBreadcrumb.slice(0, -1); setCurrentBreadcrumb(newBreadcrumb); const newParent = newBreadcrumb.at(-1); setCategoriesForCurrentView(allAppCategories.filter(cat => cat.parentTopicValue === newParent?.topicValue)); } } : undefined}
            currentLocale={locale}
            isCustomTopicValidating={isCustomTopicValidating}
            userGeneratedCustomTopics={userGeneratedCustomTopics}
            onSelectUserGeneratedCustomTopic={handleUserGeneratedCustomTopicSelect}
            onDeleteCustomTopic={handleDeleteCustomTopic}
          />
        );

      case 'confirming_custom_topic':
        return customTopicToConfirm && (
          <Card className="w-full shadow-xl animate-fadeIn">
            <CardHeader><CardTitle className="font-headline text-3xl text-center text-primary">{t('confirmCustomTopicTitle')}</CardTitle><CardDescription className="text-center">{t('confirmCustomTopicDescription', { topicName: customTopicToConfirm.name[locale] })}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div><h3 className="font-semibold mb-1 text-lg">{t('customTopicRefinedNameLabel')}:</h3><p className="text-muted-foreground text-center text-xl py-2 px-4 border rounded-md bg-secondary">{customTopicToConfirm.name[locale]}</p></div>
              <div><h3 className="font-semibold mb-1 text-lg">{t('customTopicInstructionsLabel')}:</h3><Card className="bg-muted/50 p-3 max-h-40 overflow-y-auto"><p className="text-sm text-muted-foreground whitespace-pre-line">{customTopicToConfirm.instructions}</p></Card></div>
              <p className="text-xs text-muted-foreground text-center">{t('customTopicConfirmNote', { count: CUSTOM_TOPIC_QUESTIONS_TO_GENERATE})}</p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <Button onClick={handleConfirmCustomTopic} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"><Sparkles className="mr-2 h-4 w-4" />{t('customTopicConfirmButton')}</Button>
              <Button onClick={() => { setCustomTopicToConfirm(null); setGameState('category_selection'); }} variant="outline" className="w-full sm:w-auto"><ThumbsDown className="mr-2 h-4 w-4" />{t('customTopicCancelButton')}</Button>
            </CardFooter>
          </Card>
        );

      case 'difficulty_selection':
        return (
          <Card className="w-full shadow-xl animate-fadeIn">
            <CardHeader><CardTitle className="font-headline text-3xl text-center text-primary">{t('selectDifficultyTitle')}</CardTitle><CardDescription className="text-center">{t('selectDifficultyDescription', { topic: currentCategoryDetails?.name[locale] || currentTopicValue })}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(["easy", "medium", "hard"] as DifficultyLevel[]).map(level => (
                <Button key={level} variant="outline" className="w-full flex items-center justify-center h-16 text-lg group hover:bg-accent hover:text-accent-foreground" onClick={() => handleDifficultySelect(level)}><IconForDifficulty level={level} />{t(`difficultyLevels.${level}` as any)}</Button>
              ))}
              {!(currentCategoryDetails?.isCustomActive) && <Button variant="outline" className="w-full flex items-center justify-center h-16 text-lg group hover:bg-accent hover:text-accent-foreground" onClick={() => handleDifficultySelect("adaptive")}><Zap className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />{t('difficultyModeAdaptive')}</Button>}
            </CardContent>
            <CardFooter><Button variant="link" onClick={() => { setGameState('category_selection'); if (currentCategoryDetails?.isCustomActive) { resetGameToBase(); } else if (currentBreadcrumb.length > 1) { handleGoBackFromSubcategories(); } else { resetGameToBase(); } }} className="mx-auto text-sm"><ArrowLeft className="mr-2 h-4 w-4" /> {t('backToCategorySelection')}</Button></CardFooter>
          </Card>
        );

      case 'loading_question':
        return (
          <Card className="p-8 text-center animate-fadeIn shadow-xl">
            <CardContent className="flex flex-col items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <p className="mt-6 text-xl font-semibold text-muted-foreground">{t('loadingQuestion', { topic: currentCategoryDetails?.name[locale] || '...' })}</p>
            </CardContent>
          </Card>
        );
        
      case 'playing':
      case 'showing_feedback':
        return localizedQuestionCardData && questionData && (
          <QuestionCard
            questionData={localizedQuestionCardData} onAnswerSelect={handleAnswerSelect} onNextQuestion={handleNextQuestion}
            selectedAnswerIndex={selectedAnswerIndex} feedback={feedback} gameState={gameState} timeLeft={timeLeft}
            questionTimeLimitSeconds={QUESTION_TIME_LIMIT_SECONDS} onShowHint={() => setIsHintVisible(true)}
            questionId={questionData.id} bilingualQuestionText={questionData.question} categoryTopicValue={currentTopicValue}
            currentDifficulty={currentDifficultyLevel} questionsAnsweredThisGame={currentQuestionIndex + 1} totalQuestionsInGame={gameSessionQuestions.length}
          />
        );

      case 'game_over':
        return (
          <Card className="p-6 text-center animate-fadeIn shadow-xl">
            <CardHeader><BarChart3 className="h-16 w-16 text-primary mx-auto mb-4" /><CardTitle className="font-headline text-3xl text-primary">{t('gameOverTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xl font-semibold text-muted-foreground">{t('gameOverScore', { correct: score.correct, incorrect: score.incorrect, total: gameSessionQuestions.length })}</p>
              <p className="text-md text-muted-foreground">{t('gameOverTopic', { topic: currentCategoryDetails?.name[locale] || currentTopicValue, difficulty: selectedDifficultyMode === 'adaptive' && !(currentCategoryDetails?.isCustomActive) ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any) })}</p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <Button onClick={handlePlayAgainSameSettings} variant="outline" className="w-full sm:w-auto"><RotateCcw className="mr-2 h-4 w-4" />{t('gameOverPlayAgain')}</Button>
              <Button onClick={resetGameToBase} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"><Home className="mr-2 h-4 w-4" />{t('gameOverNewGame')}</Button>
            </CardFooter>
          </Card>
        );
        
      case 'error':
        return feedback && (
          <Card className="p-6 text-center animate-fadeIn shadow-xl border-destructive">
            <CardHeader><AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" /><CardTitle className="font-headline text-2xl text-destructive">{feedback.message}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">{feedback.detailedMessage || t('errorLoadingQuestionDetail')}</p></CardContent>
            <CardFooter><Button onClick={resetGameToBase} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('errorChooseNewTopicOrRefresh')}</Button></CardFooter>
          </Card>
        );

      default: return null;
    }
  };

  const IconForDifficulty = ({ level }: { level: DifficultyLevel }) => {
    switch (level) {
      case 'easy': return <SignalLow className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />;
      case 'medium': return <SignalMedium className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />;
      case 'hard': return <SignalHigh className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />;
      default: return null;
    }
  };
  const handleGoBackFromSubcategories = () => {
    if (currentBreadcrumb.length <= 1) {
      setCurrentBreadcrumb([]);
      setCategoriesForCurrentView(topLevelCategories);
    } else {
      const newBreadcrumb = currentBreadcrumb.slice(0, -1);
      setCurrentBreadcrumb(newBreadcrumb);
      const newParent = newBreadcrumb.at(-1);
      setCategoriesForCurrentView(allAppCategories.filter(cat => cat.parentTopicValue === newParent?.topicValue));
    }
  };


  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen text-foreground">
      <audio ref={audioRef} src="/audio/background-music.mp3" preload="auto" />
      <audio ref={correctSoundRef} src="/audio/correct-answer.mp3" preload="auto" />
      <audio ref={wrongSoundRef} src="/audio/wrong-answer.mp3" preload="auto" />
      <header className="my-6 sm:my-8 text-center w-full max-w-2xl">
        <div className="flex justify-between items-center w-full mb-2 sm:mb-4">
          <LanguageSwitcher />
          <Link href="/"><h1 className="text-3xl sm:text-5xl font-headline font-bold text-primary hover:text-primary/80 transition-colors">{t('pageTitle')}</h1></Link>
          <div className="w-32 h-10 flex items-center justify-end">
            {authLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" className="relative h-10 w-10 rounded-full"><Avatar className="h-10 w-10"><AvatarImage src={user.photoURL || ''} alt={user.email || 'User'} /><AvatarFallback><UserCircle className="h-8 w-8" /></AvatarFallback></Avatar></Button></DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal"><div className="flex flex-col space-y-1"><p className="text-sm font-medium leading-none">{t('loggedInAs')}</p><p className="text-xs leading-none text-muted-foreground">{user.email}</p></div></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userProfile?.role === 'admin' && <DropdownMenuItem asChild className="cursor-pointer"><Link href="/admin/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" /><span>{t('AdminLayout.adminPanelTitle')}</span></Link></DropdownMenuItem>}
                  {userProfile?.role === 'user' && <DropdownMenuItem asChild className="cursor-pointer"><Link href="/profile"><User className="mr-2 h-4 w-4" /><span>{t('myProfile')}</span></Link></DropdownMenuItem>}
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer"><LogOut className="mr-2 h-4 w-4" /><span>{t('logoutButton')}</span></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login"><Button variant="outline"><LogIn className="mr-2 h-4 w-4" />{t('loginButton')}</Button></Link>
            )}
          </div>
        </div>
      </header>

      {gameState !== 'category_selection' && gameState !== 'difficulty_selection' && gameState !== 'initial_loading' && gameState !== 'downloading_category_questions' && gameState !== 'game_over' && gameState !== 'confirming_custom_topic' && gameState !== 'validating_custom_topic' && gameState !== 'loading_custom_batch' &&(
        <div className="w-full max-w-2xl mb-4">
          <ScoreDisplay score={score} onNewGame={resetGameToBase} currentQuestionNumber={currentQuestionIndex + 1} totalQuestionsInGame={gameSessionQuestions.length} gameState={gameState} />
          <div className="flex justify-center mt-2"><DifficultyIndicator /></div>
        </div>
      )}

      <main className="w-full max-w-2xl flex-grow flex flex-col justify-center">
        {renderContent()}
      </main>
    </div>
  );
}
