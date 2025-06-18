
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestions, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionsInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { getPredefinedQuestionFromFirestore, getAllQuestionsForTopic, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import { saveQuestionsToDB, getQuestionFromDB, countAllQuestionsInDB, clearAllQuestionsFromDB, countQuestionsByCriteriaInDB } from "@/services/indexedDBService"; 
import type { CategoryDefinition, DifficultyMode, BilingualText } from "@/types";
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslations, useLocale } from "next-intl";
import type { AppLocale } from "@/lib/i18n-config";
import { useToast } from "@/hooks/use-toast";
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
  ArrowLeft
} from "lucide-react";
import { logEvent as logEventFromLib, analytics } from "@/lib/firebase";

type GameState = 
  'initial_loading' | 
  'category_selection' | 
  'difficulty_selection' | 
  'loading_question' | 
  'loading_custom_batch' |
  'downloading_category_questions' | 
  'playing' | 
  'showing_feedback' | 
  'game_over' | 
  'error';

type CurrentQuestionData = GenerateTriviaQuestionOutput & { id?: string }; 

const DIFFICULTY_LEVELS_ORDER: DifficultyLevel[] = ["easy", "medium", "hard"];
const QUESTION_TIME_LIMIT_SECONDS = 30;
const QUESTIONS_PER_GAME = 10;
const DEFAULT_MODEL_FOR_GAME = 'googleai/gemini-2.5-flash';

const CURRENT_CONTENT_VERSION = "v1.0.1"; 
const CONTENT_VERSION_STORAGE_KEY = 'downloadedContentVersion';
const DOWNLOADED_TOPICS_STORAGE_KEY = 'downloadedTopicValues_v1';


export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();

  // Categorías y Navegación
  const [allAppCategories, setAllAppCategories] = useState<CategoryDefinition[]>([]);
  const [topLevelCategories, setTopLevelCategories] = useState<CategoryDefinition[]>([]);
  const [categoriesForCurrentView, setCategoriesForCurrentView] = useState<CategoryDefinition[]>([]);
  const [currentBreadcrumb, setCurrentBreadcrumb] = useState<CategoryDefinition[]>([]);
  
  const [gameState, setGameState] = useState<GameState>('initial_loading');
  const [initialLoadMessage, setInitialLoadMessage] = useState<string>('');
  const [loadingMessage, setLoadingMessage] = useState<string>(''); 

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

  const [isCustomTopicGameActive, setIsCustomTopicGameActive] = useState<boolean>(false);
  const [customTopicQuestionsCache, setCustomTopicQuestionsCache] = useState<CurrentQuestionData[]>([]);
  const [currentBatchQuestionIndex, setCurrentBatchQuestionIndex] = useState<number>(0);

  const [downloadedTopicValues, setDownloadedTopicValues] = useState<Set<string>>(new Set());
  

  const logAnalyticsEvent = useCallback((eventName: string, eventParams?: { [key: string]: any }) => {
    if (analytics) {
      logEventFromLib(eventName, eventParams);
    }
  }, []);

  // Carga inicial de categorías y chequeo de versión de contenido
  useEffect(() => {
    setCurrentYear(new Date().getFullYear());

    const performInitialSetup = async () => {
      setGameState('initial_loading');
      setInitialLoadMessage(t('initialLoadCheck'));

      let localContentVersion: string | null = null;
      let localDownloadedTopics: Set<string> = new Set();

      if (typeof window !== 'undefined') {
        localContentVersion = localStorage.getItem(CONTENT_VERSION_STORAGE_KEY);
        const storedTopicsString = localStorage.getItem(DOWNLOADED_TOPICS_STORAGE_KEY);
        if (storedTopicsString) {
          try {
            localDownloadedTopics = new Set(JSON.parse(storedTopicsString));
          } catch (e) {
            console.error("Error parsing downloaded topics from localStorage", e);
            localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY); 
          }
        }
      }

      if (localContentVersion !== CURRENT_CONTENT_VERSION) {
        setInitialLoadMessage(t('updatingOfflineContentVersion'));
        if (typeof window !== 'undefined' && window.indexedDB) {
          try {
            await clearAllQuestionsFromDB(); 
            console.log("[TriviaPage] Content version mismatch. Cleared IndexedDB.");
            localStorage.setItem(CONTENT_VERSION_STORAGE_KEY, CURRENT_CONTENT_VERSION);
            localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY); 
            localDownloadedTopics = new Set(); 
            toast({ title: t('toastSuccessTitle') as string, description: t('offlineContentVersionUpdated')});
          } catch (error) {
            console.error("[TriviaPage] Error clearing IndexedDB for content update:", error);
            toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('offlineContentUpdateError') });
          }
        }
        setInitialLoadMessage(t('offlineContentVersionUpdatedMessage'));
      } else {
        setInitialLoadMessage(t('initialLoadDone'));
      }
      setDownloadedTopicValues(localDownloadedTopics);

      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        const allCats = await getAppCategories();
        setAllAppCategories(allCats);
        const topLevels = allCats.filter(cat => !cat.parentTopicValue);
        setTopLevelCategories(topLevels);
        setCategoriesForCurrentView(topLevels);
        
        if (allCats.length > 0) {
          setGameState('category_selection');
        } else {
          setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorNoCategoriesDefined'), isCorrect: false });
          setGameState('error'); 
        }
      } catch (error) {
        console.error("[TriviaPage] Error fetching categories for UI:", error);
        setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
        setGameState('error');
      }
    };

    performInitialSetup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]); 


  const downloadQuestionsForTopic = async (categoryToDownload: CategoryDefinition): Promise<boolean> => {
    if (downloadedTopicValues.has(categoryToDownload.topicValue) && localStorage.getItem(CONTENT_VERSION_STORAGE_KEY) === CURRENT_CONTENT_VERSION) {
      // console.log(`[TriviaPage] Questions for ${categoryToDownload.topicValue} already downloaded and content version matches.`);
      return true; 
    }

    if (categoryToDownload.isPredefined === false) { 
        // console.log(`[TriviaPage] Category ${categoryToDownload.topicValue} is not predefined. Skipping download.`);
        return true; 
    }
    
    const originalGameState = gameState;
    setGameState('downloading_category_questions');
    setLoadingMessage(t('downloadingCategoryQuestions', { categoryName: categoryToDownload.name[locale] }));

    try {
      const questions = await getAllQuestionsForTopic(categoryToDownload.topicValue);
      if (questions.length > 0) {
        await saveQuestionsToDB(questions);
      }
      const newDownloadedTopics = new Set(downloadedTopicValues).add(categoryToDownload.topicValue);
      setDownloadedTopicValues(newDownloadedTopics);
      localStorage.setItem(DOWNLOADED_TOPICS_STORAGE_KEY, JSON.stringify(Array.from(newDownloadedTopics)));
      localStorage.setItem(CONTENT_VERSION_STORAGE_KEY, CURRENT_CONTENT_VERSION); 
      
      toast({ title: t('toastSuccessTitle') as string, description: t('categoryDownloadComplete', { categoryName: categoryToDownload.name[locale] }) });
      setGameState(originalGameState === 'downloading_category_questions' ? 'difficulty_selection' : originalGameState); 
      return true;
    } catch (error) {
      console.error(`[TriviaPage] Error downloading questions for topic ${categoryToDownload.topicValue}:`, error);
      toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }) });
      setGameState(originalGameState === 'downloading_category_questions' ? 'error' : originalGameState); 
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

  const prepareAndSetQuestion = (qData: CurrentQuestionData) => {
    setQuestionData(qData);
    const questionTextInLocale = qData.question[locale] || `q_text_${Date.now()}`;
    if (qData.answers && typeof qData.correctAnswerIndex === 'number' && qData.answers[qData.correctAnswerIndex]) {
       const correctAnswerTextInLocale = qData.answers[qData.correctAnswerIndex]![locale];
       setAskedCorrectAnswerTexts(prev => [...new Set([...prev, correctAnswerTextInLocale])]);
    }

    setAskedQuestionTextsForAI(prev => [...new Set([...prev, questionTextInLocale])]);

    if (qData.id && !isCustomTopicGameActive && currentCategoryDetails?.isPredefined !== false) { 
      setAskedFirestoreIds(prev => [...new Set([...prev, qData.id!])]);
    }
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null);
    setIsHintVisible(false);
    setGameState('playing');
  };

  const fetchPredefinedOrSingleAIQuestion = useCallback(async (topic: string, difficulty: DifficultyLevel, categoryDetailsForSelectedTopic: CategoryDefinition | null) => {
    setGameState('loading_question');
    
    let fetchedQuestionData: CurrentQuestionData | null = null;

    if (categoryDetailsForSelectedTopic && categoryDetailsForSelectedTopic.isPredefined !== false) {
      try {
        fetchedQuestionData = await getQuestionFromDB(topic, difficulty, askedFirestoreIds);
      } catch (indexedDbError) {
        console.warn(`[TriviaPage] Error fetching from IndexedDB for topic "${topic}", will fall back to Firestore/Genkit:`, indexedDbError);
      }
    }
    
    if (!fetchedQuestionData && categoryDetailsForSelectedTopic && categoryDetailsForSelectedTopic.isPredefined !== false) {
        try {
          fetchedQuestionData = await getPredefinedQuestionFromFirestore(topic, askedFirestoreIds, difficulty);
        } catch (firestoreError) {
          console.warn(`[TriviaPage] Error fetching from Firestore for topic "${topic}", will fall back to Genkit:`, firestoreError);
        }
    }

    if (!fetchedQuestionData && categoryDetailsForSelectedTopic) {
      const inputForAI: GenerateTriviaQuestionsInput = {
        topic,
        previousQuestions: askedQuestionTextsForAI,
        previousCorrectAnswers: askedCorrectAnswerTexts,
        targetDifficulty: difficulty,
        count: 1,
        modelName: DEFAULT_MODEL_FOR_GAME,
        categoryInstructions: categoryDetailsForSelectedTopic.detailedPromptInstructions,
      };
      if (categoryDetailsForSelectedTopic.difficultySpecificGuidelines && categoryDetailsForSelectedTopic.difficultySpecificGuidelines[difficulty]) {
        inputForAI.difficultySpecificInstruction = categoryDetailsForSelectedTopic.difficultySpecificGuidelines[difficulty];
      }

      try {
        const newQuestionArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionArray && newQuestionArray.length > 0) {
          fetchedQuestionData = newQuestionArray[0]!;
        }
      } catch (genkitError) {
        console.error(`[TriviaPage] Genkit fallback failed for predefined topic "${topic}":`, genkitError);
      }
    }

    if (fetchedQuestionData) {
      prepareAndSetQuestion(fetchedQuestionData);
    } else {
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionForDifficulty', { difficulty: t(`difficultyLevels.${difficulty}` as any) as string }), isCorrect: false });
      setGameState('error');
      setCurrentQuestionNumberInGame(prev => Math.max(0, prev - 1)); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, askedFirestoreIds, askedQuestionTextsForAI, askedCorrectAnswerTexts, t, currentCategoryDetails]);


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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return () => clearTimer();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHintVisible, questionData, gameState, currentTopic, currentCategoryDetails, locale, logAnalyticsEvent]);

  
  // --- Category Navigation Logic ---
  const handleCategoryClick = async (category: CategoryDefinition) => {
    const children = allAppCategories.filter(cat => cat.parentTopicValue === category.topicValue);
    const isCustom = !allAppCategories.some(appCat => appCat.topicValue === category.topicValue); 

    if (isCustom) { 
        setCurrentTopic(category.topicValue); 
        setCurrentCategoryDetails(null);
        setIsCustomTopicGameActive(true);
        setCustomTopicQuestionsCache([]);
        setCurrentBatchQuestionIndex(0);
        setGameState('difficulty_selection');
         logAnalyticsEvent('select_category', {
            category_topic_value: category.topicValue,
            category_name: category.topicValue, 
            is_custom_topic: true
        });
    } else if (children.length > 0) { 
        setCurrentBreadcrumb(prev => [...prev, category]);
        setCategoriesForCurrentView(children);
    } else { 
        
        const downloadSuccess = await downloadQuestionsForTopic(category);
        if (!downloadSuccess) return; 

        setCurrentTopic(category.topicValue);
        setCurrentCategoryDetails(category);
        setCurrentBreadcrumb(prev => [...prev, category]);
        setIsCustomTopicGameActive(false);
        setGameState('difficulty_selection');
        logAnalyticsEvent('select_category', {
            category_topic_value: category.topicValue,
            category_name: category.name[locale],
            is_custom_topic: false
        });
    }
    
    setScore({ correct: 0, incorrect: 0 });
    setAskedFirestoreIds([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);
  };

  const handlePlayParentCategory = async () => {
    const parentCategory = currentBreadcrumb.at(-1);
    if (parentCategory) {
      
      const downloadSuccess = await downloadQuestionsForTopic(parentCategory);
      if (!downloadSuccess) return;

      setCurrentTopic(parentCategory.topicValue);
      setCurrentCategoryDetails(parentCategory);
      setIsCustomTopicGameActive(false); 
      setGameState('difficulty_selection');
       logAnalyticsEvent('select_category', { 
            category_topic_value: parentCategory.topicValue,
            category_name: parentCategory.name[locale],
            is_custom_topic: false,
            played_as_parent: true
        });
    }
     
    setScore({ correct: 0, incorrect: 0 });
    setAskedFirestoreIds([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);
  };

  const handleGoBackFromSubcategories = () => {
    if (currentBreadcrumb.length <= 1) {
      setCurrentBreadcrumb([]);
      setCategoriesForCurrentView(topLevelCategories);
    } else {
      const newBreadcrumb = currentBreadcrumb.slice(0, -1);
      setCurrentBreadcrumb(newBreadcrumb);
      const newParent = newBreadcrumb.at(-1);
      if (newParent) {
        const children = allAppCategories.filter(cat => cat.parentTopicValue === newParent.topicValue);
        setCategoriesForCurrentView(children);
      } else { 
        setCategoriesForCurrentView(topLevelCategories);
      }
    }
  };
  // --- End Category Navigation Logic ---


  const handleDifficultySelect = async (mode: DifficultyMode) => {
    setSelectedDifficultyMode(mode);
    let initialDifficulty: DifficultyLevel;
    if (mode === "adaptive") {
      initialDifficulty = "medium";
    } else {
      initialDifficulty = mode;
    }
    setCurrentDifficultyLevel(initialDifficulty);
    setQuestionsAnsweredThisGame(0); 
    setCurrentQuestionNumberInGame(1); 

    logAnalyticsEvent('start_game_with_difficulty', {
      category_topic_value: currentTopic,
      category_name: currentCategoryDetails?.name[locale] || currentTopic,
      difficulty_mode_selected: mode,
      initial_difficulty_level: initialDifficulty
    });

    if (isCustomTopicGameActive) {
      setGameState('loading_custom_batch');
      const inputForAI: GenerateTriviaQuestionsInput = {
        topic: currentTopic, 
        previousQuestions: askedQuestionTextsForAI,
        previousCorrectAnswers: askedCorrectAnswerTexts, 
        targetDifficulty: initialDifficulty,
        count: QUESTIONS_PER_GAME,
        modelName: DEFAULT_MODEL_FOR_GAME,
      };

      try {
        const newQuestionsArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionsArray && newQuestionsArray.length > 0) {
          setCustomTopicQuestionsCache(newQuestionsArray);
          setCurrentBatchQuestionIndex(0);
          prepareAndSetQuestion(newQuestionsArray[0]!);
        } else {
          setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionsForCustomTopic'), isCorrect: false });
          setGameState('error');
          setCurrentQuestionNumberInGame(0);
        }
      } catch (genkitError) {
        console.error(`[TriviaPage] Failed to generate batch for custom topic "${currentTopic}":`, genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        setCurrentQuestionNumberInGame(0);
      }
    } else { 
      fetchPredefinedOrSingleAIQuestion(currentTopic, initialDifficulty, currentCategoryDetails);
    }
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
    
    setQuestionsAnsweredThisGame(prev => prev + 1); 

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
      setCurrentQuestionNumberInGame(prev => prev + 1);
      if (isCustomTopicGameActive) {
        const nextIndex = currentBatchQuestionIndex + 1;
        if (nextIndex < customTopicQuestionsCache.length) {
          setCurrentBatchQuestionIndex(nextIndex);
          prepareAndSetQuestion(customTopicQuestionsCache[nextIndex]!);
        } else {
          console.error("Custom topic cache exhausted unexpectedly.");
          setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorGeneric'), isCorrect: false });
          setGameState('error');
        }
      } else {
        fetchPredefinedOrSingleAIQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
      }
    }
  };

  const handlePlayAgainSameSettings = async () => {
    
    if (!isCustomTopicGameActive && currentCategoryDetails) {
        const downloadSuccess = await downloadQuestionsForTopic(currentCategoryDetails);
        if (!downloadSuccess) {
            
            return; 
        }
    }
    
    setScore({ correct: 0, incorrect: 0 });
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(1); 
    
    
    
    if (isCustomTopicGameActive) {
        if (customTopicQuestionsCache.length > 0) {
            setCurrentBatchQuestionIndex(0); 
            prepareAndSetQuestion(customTopicQuestionsCache[0]!);
        } else {
            
            handleDifficultySelect(selectedDifficultyMode!); 
        }
    } else { 
        fetchPredefinedOrSingleAIQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
    }
  };

  const handleNewGameFullReset = () => {
    setGameState('category_selection'); 
    setCategoriesForCurrentView(topLevelCategories); 
    setCurrentBreadcrumb([]); 
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
    setIsCustomTopicGameActive(false);
    setCustomTopicQuestionsCache([]);
    setCurrentBatchQuestionIndex(0);
  };

  const DifficultyIndicator = () => {
    let Icon = ShieldQuestion;
    let color = "text-muted-foreground";
    let text = t(`difficultyLevels.${currentDifficultyLevel}` as any);

    if (selectedDifficultyMode === "adaptive") {
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
    answers: questionData.answers.map(ans => ans[locale]),
    correctAnswerIndex: questionData.correctAnswerIndex,
    explanation: questionData.explanation[locale],
    difficulty: questionData.difficulty, 
    hint: questionData.hint?.[locale], 
  } : null;


  if (gameState === 'initial_loading') {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen text-foreground">
        <Card className="p-8 text-center shadow-xl max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center">
            <DownloadCloud className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="mt-4 text-xl font-semibold text-muted-foreground animate-pulse">
              {initialLoadMessage || t('initialLoadCheck')}
            </p>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mt-6" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (gameState === 'downloading_category_questions') {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen text-foreground">
        <Card className="p-8 text-center shadow-xl max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center">
            <DownloadCloud className="h-16 w-16 text-primary mx-auto mb-4" />
            <p className="mt-4 text-xl font-semibold text-muted-foreground">
              {loadingMessage || t('downloadingDefaultMessage')}
            </p>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mt-6" />
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen text-foreground">
      <header className="my-6 sm:my-8 text-center w-full max-w-2xl">
        <div className="flex justify-between items-center w-full mb-2 sm:mb-4">
          <LanguageSwitcher />
          <h1 className="text-3xl sm:text-5xl font-headline font-bold text-primary">{t('pageTitle')}</h1>
          <div className="w-10 h-10" /> 
        </div>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('pageDescription')}</p>
      </header>

      {gameState !== 'category_selection' && gameState !== 'difficulty_selection' && gameState !== 'loading_custom_batch' && gameState !== 'loading_question' && gameState !== 'initial_loading' && gameState !== 'downloading_category_questions' && gameState !== 'game_over' && (
        <div className="w-full max-w-2xl mb-4">
          <ScoreDisplay
            score={score}
            onNewGame={handleNewGameFullReset}
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
        {gameState === 'category_selection' && (
          <CategorySelector
            categoriesToDisplay={categoriesForCurrentView}
            currentParent={currentBreadcrumb.length > 0 ? currentBreadcrumb.at(-1) : null}
            customTopicInput={customTopicInput}
            onCustomTopicChange={setCustomTopicInput}
            onSelectCategory={handleCategoryClick}
            onPlayParentCategory={currentBreadcrumb.length > 0 ? handlePlayParentCategory : undefined}
            onGoBack={currentBreadcrumb.length > 0 ? handleGoBackFromSubcategories : undefined}
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
              <Button variant="link" onClick={() => {
                setGameState('category_selection');
                setCategoriesForCurrentView(currentBreadcrumb.length > 0 ? allAppCategories.filter(c => c.parentTopicValue === currentBreadcrumb.at(-2)?.topicValue) : topLevelCategories);
                // No need to pop breadcrumb here as we are going back to a parent selection state
              }} className="mx-auto text-sm">
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
         {gameState === 'loading_custom_batch' && (
          <Card className="p-8 text-center animate-fadeIn shadow-xl">
            <CardContent className="flex flex-col items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <p className="mt-6 text-xl font-semibold text-muted-foreground">
                {t('loadingCustomBatch', {
                  count: QUESTIONS_PER_GAME,
                  topic: currentTopic,
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
            questionId={isCustomTopicGameActive ? undefined : questionData.id}
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
              <Button onClick={handlePlayAgainSameSettings} variant="outline" className="w-full sm:w-auto">
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('gameOverPlayAgain')}
              </Button>
              <Button onClick={handleNewGameFullReset} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
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
                    if (isCustomTopicGameActive) {
                       handleDifficultySelect(selectedDifficultyMode!);
                    } else {
                      fetchPredefinedOrSingleAIQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
                    }
                  }}
                  variant="outline"
                >
                  {t('errorTryAgainTopicWithMode', {
                    difficulty: selectedDifficultyMode === 'adaptive' ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any),
                    topic: currentCategoryDetails?.name[locale] || currentTopic,
                  })}
                </Button>
              )}
              <Button onClick={handleNewGameFullReset} className="bg-primary hover:bg-primary/90 text-primary-foreground">{t('errorChooseNewTopicOrRefresh')}</Button>
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

