
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestions, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionsInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { validateCustomTopic, type ValidateCustomTopicOutput } from "@/ai/flows/validate-custom-topic";
import { getPredefinedQuestionFromFirestore, getAllQuestionsForTopic, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import {
  saveQuestionsToDB, getQuestionFromDB, clearAllQuestionsFromDB,
  saveCategoriesToCache, getCategoriesFromCache, clearCategoriesCache,
  saveCustomQuestionsToDB, getCustomQuestionFromDB, clearAllCustomQuestionsFromDB,
  saveCustomTopicMeta, getCustomTopicsMeta, clearAllCustomTopicsMeta,
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
import { useTranslations, useLocale } from "next-intl";
import type { AppLocale } from '@/lib/i18n-config';
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
  ArrowLeft,
  Sparkles,
  ThumbsDown,
  ScrollText,
  ListChecks
} from "lucide-react";
import { logEvent as logEventFromLib, analytics } from "@/lib/firebase";

type GameState =
  'initial_loading' |
  'category_selection' |
  'validating_custom_topic' |
  'confirming_custom_topic' |
  'difficulty_selection' |
  'loading_question' |
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
}

// Combined question type to handle both predefined and custom questions from DB
type GameQuestion = PredefinedQuestion | CustomQuestion;

const DIFFICULTY_LEVELS_ORDER: DifficultyLevel[] = ["easy", "medium", "hard"];
const QUESTION_TIME_LIMIT_SECONDS = 30;
const QUESTIONS_PER_GAME = 10;
const CUSTOM_TOPIC_QUESTIONS_TO_GENERATE = 30;
const DEFAULT_MODEL_FOR_GAME = 'googleai/gemini-2.5-flash';

// Utility function to shuffle an array (Fisher-Yates shuffle)
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

  const [allAppCategories, setAllAppCategories] = useState<CategoryDefinition[]>([]);
  const [topLevelCategories, setTopLevelCategories] = useState<CategoryDefinition[]>([]);
  const [categoriesForCurrentView, setCategoriesForCurrentView] = useState<CategoryDefinition[]>([]);
  const [currentBreadcrumb, setCurrentBreadcrumb] = useState<CategoryDefinition[]>([]);

  const [gameState, setGameState] = useState<GameState>('initial_loading');

  const [currentTopicValue, setCurrentTopicValue] = useState<string>('');
  const [currentCategoryDetails, setCurrentCategoryDetails] = useState<ActiveCategoryDetails | null>(null);


  const [questionData, setQuestionData] = useState<GameQuestion | null>(null);
  const [shuffledAnswers, setShuffledAnswers] = useState<BilingualText[]>([]);
  const [currentCorrectShuffledIndex, setCurrentCorrectShuffledIndex] = useState<number | null>(null);

  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string; explanation?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');

  const [askedQuestionIdsFromDB, setAskedQuestionIdsFromDB] = useState<string[]>([]);
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

  const [downloadedPredefinedTopicValues, setDownloadedPredefinedTopicValues] = useState<Set<string>>(new Set());
  const [userGeneratedCustomTopics, setUserGeneratedCustomTopics] = useState<CustomTopicMeta[]>([]);


  const [isCustomTopicValidating, setIsCustomTopicValidating] = useState(false);
  const [customTopicToConfirm, setCustomTopicToConfirm] = useState<{
    name: BilingualText;
    instructions: string;
    originalInput: string;
  } | null>(null);


  const logAnalyticsEvent = useCallback((eventName: string, eventParams?: { [key: string]: any }) => {
    if (analytics) {
      logEventFromLib(eventName, eventParams);
    }
  }, []);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    console.log("[DEBUG] Initial setup starting...");

    const performInitialSetup = async () => {
      setGameState('initial_loading');
      console.log("[DEBUG] performInitialSetup: GameState set to initial_loading. Current content version const: ", CURRENT_CONTENT_VERSION);

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
      console.log(`[DEBUG] performInitialSetup: Stored content version from localStorage: ${storedContentVersion}`);

      if (storedContentVersion !== CURRENT_CONTENT_VERSION) {
        console.log(`[DEBUG] performInitialSetup: Content version mismatch. Stored: ${storedContentVersion}, Current: ${CURRENT_CONTENT_VERSION}. Clearing caches.`);
        if (typeof window !== 'undefined' && window.indexedDB) {
          try {
            await clearAllQuestionsFromDB();
            await clearCategoriesCache();
            await clearAllCustomQuestionsFromDB();
            await clearAllCustomTopicsMeta();
            console.log("[DEBUG] performInitialSetup: All IndexedDB stores cleared due to version mismatch.");
            localStorage.setItem(CONTENT_VERSION_STORAGE_KEY, CURRENT_CONTENT_VERSION);
            localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY);
            localDownloadedPredefinedTopics = new Set();
            toast({ title: t('toastSuccessTitle') as string, description: t('offlineContentVersionUpdated')});
          } catch (error) {
            console.error("[DEBUG] performInitialSetup: Error clearing IndexedDB for content update:", error);
            toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('offlineContentUpdateError') });
          }
        }
      }
      setDownloadedPredefinedTopicValues(localDownloadedPredefinedTopics);

      try {
        const customMetas = await getCustomTopicsMeta();
        setUserGeneratedCustomTopics(customMetas);
        console.log(`[DEBUG] performInitialSetup: Loaded ${customMetas.length} user-generated custom topics from IndexedDB.`);
      } catch (error) {
        console.error("[DEBUG] performInitialSetup: Error loading custom topics metadata:", error);
      }

      let categoriesToUse: CategoryDefinition[] | null = null;
      try {
        const cachedCategoriesData = await getCategoriesFromCache();
        if (cachedCategoriesData && storedContentVersion === CURRENT_CONTENT_VERSION) {
          console.log("[DEBUG] performInitialSetup: Using predefined categories from IndexedDB cache.");
          categoriesToUse = cachedCategoriesData.categories;
        } else {
          console.log("[DEBUG] performInitialSetup: Fetching predefined categories from Firestore.");
          categoriesToUse = await getAppCategories();
          if (categoriesToUse && categoriesToUse.length > 0) {
            await saveCategoriesToCache(categoriesToUse);
            console.log("[DEBUG] performInitialSetup: Predefined categories fetched from Firestore and saved to cache.");
          }
        }

        if (categoriesToUse && categoriesToUse.length > 0) {
          setAllAppCategories(categoriesToUse);
          const topLevels = categoriesToUse.filter(cat => !cat.parentTopicValue);
          setTopLevelCategories(topLevels);
          setCategoriesForCurrentView(topLevels);
          console.log("[DEBUG] performInitialSetup: Predefined categories processed. Top level categories:", topLevels.length);
          setGameState('category_selection');
          console.log("[DEBUG] performInitialSetup: GameState set to category_selection");
        } else {
          setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorNoCategoriesDefined'), isCorrect: false });
          setGameState('error');
          console.warn("[DEBUG] performInitialSetup: No predefined categories found/defined. GameState set to error.");
        }
      } catch (error) {
        console.error("[DEBUG] performInitialSetup: Error during predefined category loading/processing:", error);
        setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
        setGameState('error');
      }
    };

    performInitialSetup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const downloadQuestionsForTopic = async (categoryToDownload: CategoryDefinition): Promise<boolean> => {
    console.log(`[DEBUG] downloadQuestionsForTopic: Called for category: ${categoryToDownload.topicValue}`);

    if (downloadedPredefinedTopicValues.has(categoryToDownload.topicValue) && localStorage.getItem(CONTENT_VERSION_STORAGE_KEY) === CURRENT_CONTENT_VERSION) {
      console.log(`[DEBUG] downloadQuestionsForTopic: Topic ${categoryToDownload.topicValue} already downloaded and version matches. Skipping download.`);
      return true;
    }

    setGameState('downloading_category_questions');
    console.log(`[DEBUG] downloadQuestionsForTopic: GameState set to downloading_category_questions for ${categoryToDownload.topicValue}`);

    try {
      console.log(`[DEBUG] downloadQuestionsForTopic: Calling getAllQuestionsForTopic for ${categoryToDownload.topicValue}`);
      const questions = await getAllQuestionsForTopic(categoryToDownload.topicValue);
      console.log(`[DEBUG] downloadQuestionsForTopic: Fetched ${questions.length} questions from Firestore for ${categoryToDownload.topicValue}.`);
      if (questions.length > 0) {
        await saveQuestionsToDB(questions);
        console.log(`[DEBUG] downloadQuestionsForTopic: Saved ${questions.length} questions to IndexedDB for ${categoryToDownload.topicValue}.`);
      } else {
         console.log(`[DEBUG] downloadQuestionsForTopic: No predefined questions found in Firestore for ${categoryToDownload.topicValue}. This is normal if it's a new or very specific category.`);
      }
      const newDownloadedTopics = new Set(downloadedPredefinedTopicValues).add(categoryToDownload.topicValue);
      setDownloadedPredefinedTopicValues(newDownloadedTopics);
      if(typeof window !== 'undefined') {
        localStorage.setItem(DOWNLOADED_TOPICS_STORAGE_KEY, JSON.stringify(Array.from(newDownloadedTopics)));
      }

      if (questions.length > 0) {
        toast({ title: t('toastSuccessTitle') as string, description: t('categoryDownloadComplete', { categoryName: categoryToDownload.name[locale] }) });
      }
      console.log(`[DEBUG] downloadQuestionsForTopic: Successfully processed for ${categoryToDownload.topicValue}.`);
      return true;
    } catch (error) {
      console.error(`[DEBUG] downloadQuestionsForTopic: Error processing questions for topic ${categoryToDownload.topicValue}:`, error);
      toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }) });
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }), isCorrect: false });
      return false;
    } finally {
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
    console.log("[DEBUG] prepareAndSetQuestion: Setting question:", qData.id || "AI Generated", "for topicValue:", currentTopicValue);
    setQuestionData(qData);
    
    // Shuffle answers
    const allAnswers = [qData.correctAnswer, ...qData.distractors];
    const shuffled = shuffleArray(allAnswers);
    const newCorrectIndex = shuffled.findIndex(ans => ans.en === qData.correctAnswer.en && ans.es === qData.correctAnswer.es);

    setShuffledAnswers(shuffled);
    setCurrentCorrectShuffledIndex(newCorrectIndex);

    const questionTextInLocale = qData.question[locale] || `q_text_${Date.now()}`;
    const correctAnswerTextInLocale = qData.correctAnswer[locale];

    setAskedCorrectAnswerTexts(prev => [...new Set([...prev, correctAnswerTextInLocale])]);
    setAskedQuestionTextsForAI(prev => [...new Set([...prev, questionTextInLocale])]);

    if (qData.id ) {
      console.log(`[DEBUG] prepareAndSetQuestion: Adding question ID ${qData.id} to askedQuestionIdsFromDB.`);
      setAskedQuestionIdsFromDB(prev => [...new Set([...prev, qData.id!])]);
    }
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null);
    setIsHintVisible(false);
    setGameState('playing');
    console.log("[DEBUG] prepareAndSetQuestion: GameState set to playing");
  }, [locale, currentTopicValue]);

  const fetchAndSetNextQuestionForGame = useCallback(async (topicVal: string, difficulty: DifficultyLevel, activeCatDetails: ActiveCategoryDetails | null) => {
    setGameState('loading_question');
    const isCustom = activeCatDetails?.isCustomActive || false;
    console.log(`[DEBUG] fetchAndSetNextQuestionForGame: TopicValue: ${topicVal}, Diff: ${difficulty}, isCustom: ${isCustom}`);

    let fetchedQuestionData: GameQuestion | null = null;

    if (isCustom) {
        console.log(`[DEBUG] fetchAndSetNextQuestionForGame: Custom topic. Attempting to get from customQuestionsStore. Asked IDs:`, askedQuestionIdsFromDB);
        fetchedQuestionData = await getCustomQuestionFromDB(topicVal, difficulty, askedQuestionIdsFromDB);
        if (fetchedQuestionData) console.log(`[DEBUG] fetchAndSetNextQuestionForGame: Found custom question in IDB (ID: ${fetchedQuestionData.id}) for topic ${topicVal}`);
        else console.log(`[DEBUG] fetchAndSetNextQuestionForGame: No unasked custom question in IDB for ${topicVal} - ${difficulty}. This might mean the batch is exhausted for this difficulty.`);
    } else { 
        console.log(`[DEBUG] fetchAndSetNextQuestionForGame: Predefined topic. Attempting to get from predefinedQuestionsStore. Asked IDs:`, askedQuestionIdsFromDB);
        fetchedQuestionData = await getQuestionFromDB(topicVal, difficulty, askedQuestionIdsFromDB);
        if (fetchedQuestionData) console.log(`[DEBUG] fetchAndSetNextQuestionForGame: Found predefined question in IDB (ID: ${fetchedQuestionData.id})`);
        else {
            console.log(`[DEBUG] fetchAndSetNextQuestionForGame: No unasked predefined question in IDB for ${topicVal} - ${difficulty}. Trying Firestore.`);
            fetchedQuestionData = await getPredefinedQuestionFromFirestore(topicVal, askedQuestionIdsFromDB, difficulty);
            if (fetchedQuestionData) console.log(`[DEBUG] fetchAndSetNextQuestionForGame: Found predefined question in Firestore (ID: ${fetchedQuestionData.id})`);
        }
    }

    if (!fetchedQuestionData && !isCustom && activeCatDetails) { 
      const instructions = activeCatDetails?.detailedPromptInstructions;
      const diffInstruction = activeCatDetails?.difficultySpecificGuidelines?.[difficulty];
      console.log(`[DEBUG] fetchAndSetNextQuestionForGame: No DB question. Falling back to Genkit AI for predefined topic ${topicVal}.`);

      const inputForAI: GenerateTriviaQuestionsInput = {
        topic: topicVal,
        previousQuestions: askedQuestionTextsForAI,
        previousCorrectAnswers: askedCorrectAnswerTexts,
        targetDifficulty: difficulty,
        count: 1,
        modelName: DEFAULT_MODEL_FOR_GAME,
        categoryInstructions: instructions,
      };
      if (diffInstruction) inputForAI.difficultySpecificInstruction = diffInstruction;

      try {
        const newQuestionArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionArray && newQuestionArray.length > 0) {
          const aiQuestion = newQuestionArray[0]!;
          fetchedQuestionData = { ...aiQuestion, id: `ai_${crypto.randomUUID()}`, topicValue: topicVal };
          console.log(`[DEBUG] fetchAndSetNextQuestionForGame: AI generated question for predefined topic ${topicVal}.`);
        } else {
           console.log(`[DEBUG] fetchAndSetNextQuestionForGame: AI generation returned no questions for predefined topic ${topicVal}.`);
        }
      } catch (genkitError) {
        console.error(`[DEBUG] fetchAndSetNextQuestionForGame: Genkit AI fallback failed for predefined topic "${topicVal}":`, genkitError);
      }
    }

    if (fetchedQuestionData) {
      prepareAndSetQuestion(fetchedQuestionData);
    } else {
      const errorDetailKey = isCustom ? 'errorNoMoreQuestionsForCustomTopicDifficulty' : 'errorNoQuestionForDifficulty';
      setFeedback({
        message: t('errorLoadingQuestion'),
        detailedMessage: t(errorDetailKey, { difficulty: t(`difficultyLevels.${difficulty}` as any) as string, topic: activeCatDetails?.name[locale] || topicVal }),
        isCorrect: false
      });
      setGameState('error');
      console.warn(`[DEBUG] fetchAndSetNextQuestionForGame: Failed to fetch or generate ANY question for ${topicVal} - ${difficulty}. GameState set to error.`);
      if (!isCustom || errorDetailKey !== 'errorNoMoreQuestionsForCustomTopicDifficulty') {
        setCurrentQuestionNumberInGame(prev => Math.max(0, prev - 1));
      }
    }
  }, [askedQuestionIdsFromDB, askedQuestionTextsForAI, askedCorrectAnswerTexts, locale, logAnalyticsEvent, prepareAndSetQuestion, t]);


  const handleTimeout = useCallback(() => {
    if (!questionData || gameState !== 'playing') return;

    clearTimer();
    setSelectedAnswerIndex(null);
    setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));

    const correctAnswerText = questionData.correctAnswer[locale] ?? t('errorLoadingQuestionDetail');
    const explanationText = questionData.explanation?.[locale] ?? '';

    setFeedback({
      message: t('timesUp'),
      detailedMessage: t('correctAnswerWas', { answer: correctAnswerText }),
      isCorrect: false,
      explanation: explanationText
    });

    logAnalyticsEvent('answer_question', {
      category_topic_value: currentTopicValue,
      category_name: currentCategoryDetails?.name[locale] || currentTopicValue,
      question_difficulty: questionData.difficulty,
      is_correct: false,
      timed_out: true,
      question_id: questionData.id,
      is_custom_topic: currentCategoryDetails?.isCustomActive || false,
    });

    if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
      const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
      if (currentIndex > 0) {
        setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
      }
    }
    setQuestionsAnsweredThisGame(prev => prev + 1);
    setGameState('showing_feedback');
  }, [questionData, gameState, clearTimer, currentDifficultyLevel, selectedDifficultyMode, locale, t, currentTopicValue, currentCategoryDetails, logAnalyticsEvent]);

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
        category_topic_value: currentTopicValue,
        category_name: currentCategoryDetails?.name[locale] || currentTopicValue,
        question_difficulty: questionData.difficulty,
        question_id: questionData.id,
        is_custom_topic: currentCategoryDetails?.isCustomActive || false,
      });
    }
  }, [isHintVisible, questionData, gameState, currentTopicValue, currentCategoryDetails, locale, logAnalyticsEvent]);


  const handleCategoryClick = async (category: CategoryDefinition) => {
    console.log(`[DEBUG] handleCategoryClick: Clicked predefined category: ${category.topicValue} (${category.name[locale]}), Parent: ${category.parentTopicValue}`);
    const children = allAppCategories.filter(cat => cat.parentTopicValue === category.topicValue);

    setScore({ correct: 0, incorrect: 0 });
    setAskedQuestionIdsFromDB([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);

    if (children.length > 0) {
        setCurrentBreadcrumb(prev => [...prev, category]);
        setCategoriesForCurrentView(children);
        setGameState('category_selection');
        console.log(`[DEBUG] handleCategoryClick: Category ${category.topicValue} has ${children.length} children. Navigating to subcategory view.`);
    } else {
        const categoryToPlay = category;
        console.log(`[DEBUG] handleCategoryClick: Leaf category selected: ${categoryToPlay.topicValue}, downloaded: ${downloadedPredefinedTopicValues.has(categoryToPlay.topicValue)}`);

        if (!downloadedPredefinedTopicValues.has(categoryToPlay.topicValue)) {
            console.log(`[DEBUG] handleCategoryClick: Category ${categoryToPlay.topicValue} needs download.`);
            const downloadSuccess = await downloadQuestionsForTopic(categoryToPlay);
            if (!downloadSuccess) {
                console.warn(`[DEBUG] handleCategoryClick: Download process failed for ${categoryToPlay.topicValue}. Returning to category_selection.`);
                setGameState('category_selection');
                return;
            }
            console.log(`[DEBUG] handleCategoryClick: Download process completed for ${categoryToPlay.topicValue}.`);
        }

        setCurrentTopicValue(categoryToPlay.topicValue);
        setCurrentCategoryDetails({...categoryToPlay, isCustomActive: false });
        setCurrentBreadcrumb(prev => {
            const newBreadcrumb = [...prev];
            if (!newBreadcrumb.find(bc => bc.topicValue === categoryToPlay.topicValue)) {
                newBreadcrumb.push(categoryToPlay);
            }
            return newBreadcrumb;
        });
        console.log(`[DEBUG] handleCategoryClick: Proceeding to difficulty_selection for ${categoryToPlay.topicValue}.`);
        setGameState('difficulty_selection');
        logAnalyticsEvent('select_category', {
            category_topic_value: categoryToPlay.topicValue,
            category_name: categoryToPlay.name[locale],
            is_custom_topic: false,
        });
    }
  };

  const handleUserGeneratedCustomTopicSelect = async (customTopicMeta: CustomTopicMeta) => {
    console.log(`[DEBUG] handleUserGeneratedCustomTopicSelect: Selected custom topic: ${customTopicMeta.customTopicValue}`);
    setScore({ correct: 0, incorrect: 0 });
    setAskedQuestionIdsFromDB([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);

    setCurrentTopicValue(customTopicMeta.customTopicValue);
    const activeDetails: ActiveCategoryDetails = {
        id: customTopicMeta.customTopicValue,
        topicValue: customTopicMeta.customTopicValue,
        name: customTopicMeta.name,
        icon: customTopicMeta.icon || 'Sparkles',
        detailedPromptInstructions: customTopicMeta.detailedPromptInstructions,
        isCustomActive: true,
    };
    setCurrentCategoryDetails(activeDetails);
    setCurrentBreadcrumb([]);
    setGameState('difficulty_selection');
    logAnalyticsEvent('select_category', {
        category_topic_value: customTopicMeta.customTopicValue,
        category_name: customTopicMeta.name[locale],
        is_custom_topic: true,
        is_saved_custom_topic: true,
    });
  };

  const handleCustomTopicFormSubmit = async (rawTopic: string) => {
    if (!rawTopic.trim()) return;
    console.log(`[DEBUG] handleCustomTopicFormSubmit: Validating raw topic: "${rawTopic}"`);
    setIsCustomTopicValidating(true);
    setGameState('validating_custom_topic');

    try {
      const validationResult = await validateCustomTopic({ rawTopic, currentLocale: locale });
      console.log("[DEBUG] handleCustomTopicFormSubmit: Validation result:", validationResult);

      if (validationResult.isValid && validationResult.refinedTopicName && validationResult.detailedPromptInstructions) {
        setCustomTopicToConfirm({
          name: validationResult.refinedTopicName,
          instructions: validationResult.detailedPromptInstructions,
          originalInput: rawTopic
        });
        setGameState('confirming_custom_topic');
        console.log(`[DEBUG] handleCustomTopicFormSubmit: Topic valid. Refined: "${validationResult.refinedTopicName[locale]}". GameState to confirming_custom_topic.`);
      } else {
        toast({
          variant: "destructive",
          title: t('customTopicRejectedTitle'),
          description: validationResult.rejectionReason || t('customTopicRejectedDefaultReason'),
        });
        setGameState('category_selection');
        console.warn(`[DEBUG] handleCustomTopicFormSubmit: Topic invalid or missing data. Reason: ${validationResult.rejectionReason}`);
      }
    } catch (error) {
      console.error("[DEBUG] handleCustomTopicFormSubmit: Error validating custom topic:", error);
      toast({
        variant: "destructive",
        title: t('toastErrorTitle') as string,
        description: t('customTopicValidationError'),
      });
      setGameState('category_selection');
    } finally {
      setIsCustomTopicValidating(false);
    }
  };

  const handleConfirmCustomTopic = async () => {
    if (!customTopicToConfirm) return;
    console.log(`[DEBUG] handleConfirmCustomTopic: Confirming topic: "${customTopicToConfirm.name[locale]}"`);

    const generatedCustomTopicValue = customTopicToConfirm.name.en.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
    const newMeta: CustomTopicMeta = {
        customTopicValue: generatedCustomTopicValue,
        name: customTopicToConfirm.name,
        detailedPromptInstructions: customTopicToConfirm.instructions,
        createdAt: Date.now(),
        icon: 'Sparkles',
    };

    try {
        await saveCustomTopicMeta(newMeta);
        setUserGeneratedCustomTopics(prev => [newMeta, ...prev.sort((a,b) => b.createdAt - a.createdAt)]);
        console.log(`[DEBUG] handleConfirmCustomTopic: Saved new custom topic meta to IDB: ${generatedCustomTopicValue}`);
    } catch (error) {
        console.error(`[DEBUG] handleConfirmCustomTopic: Failed to save custom topic meta to IDB:`, error);
        toast({variant: 'destructive', title: t('toastErrorTitle') as string, description: t('customTopicStorageError')});
        setGameState('category_selection');
        return;
    }

    setScore({ correct: 0, incorrect: 0 });
    setAskedQuestionIdsFromDB([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);

    setCurrentTopicValue(newMeta.customTopicValue);
    const activeDetails: ActiveCategoryDetails = {
        id: newMeta.customTopicValue,
        topicValue: newMeta.customTopicValue,
        name: newMeta.name,
        icon: newMeta.icon || 'Sparkles',
        detailedPromptInstructions: newMeta.detailedPromptInstructions,
        isCustomActive: true,
    };
    setCurrentCategoryDetails(activeDetails);
    setCurrentBreadcrumb([]);
    setGameState('difficulty_selection');
    setCustomTopicToConfirm(null);
    setCustomTopicInput('');

    logAnalyticsEvent('select_category', {
        category_topic_value: newMeta.customTopicValue,
        category_name: newMeta.name[locale],
        is_custom_topic: true,
        is_newly_created_custom_topic: true,
        original_user_input: customTopicToConfirm.originalInput
    });
    console.log(`[DEBUG] handleConfirmCustomTopic: Proceeding to difficulty_selection for NEW custom topic: "${newMeta.customTopicValue}"`);
  };

  const handleCancelCustomTopicConfirmation = () => {
    console.log("[DEBUG] handleCancelCustomTopicConfirmation: Cancelling custom topic confirmation.");
    setCustomTopicToConfirm(null);
    setGameState('category_selection');
  };


  const handlePlayParentCategory = async () => {
    const parentCategory = currentBreadcrumb.at(-1);
    if (parentCategory) {
        console.log(`[DEBUG] handlePlayParentCategory: Playing parent category: ${parentCategory.topicValue}, downloaded: ${downloadedPredefinedTopicValues.has(parentCategory.topicValue)}`);
        setScore({ correct: 0, incorrect: 0 });
        setAskedQuestionIdsFromDB([]);
        setAskedQuestionTextsForAI([]);
        setAskedCorrectAnswerTexts([]);
        setQuestionsAnsweredThisGame(0);
        setCurrentQuestionNumberInGame(0);

        if (!downloadedPredefinedTopicValues.has(parentCategory.topicValue)) {
            console.log(`[DEBUG] handlePlayParentCategory: Parent category ${parentCategory.topicValue} needs download.`);
            const downloadSuccess = await downloadQuestionsForTopic(parentCategory);
            if (!downloadSuccess) {
                console.warn(`[DEBUG] handlePlayParentCategory: Download process failed for parent ${parentCategory.topicValue}. Returning to category_selection.`);
                setGameState('category_selection');
                return;
            }
             console.log(`[DEBUG] handlePlayParentCategory: Download process completed for parent ${parentCategory.topicValue}.`);
        }

        setCurrentTopicValue(parentCategory.topicValue);
        setCurrentCategoryDetails({...parentCategory, isCustomActive: false });
        console.log(`[DEBUG] handlePlayParentCategory: Proceeding to difficulty_selection for parent ${parentCategory.topicValue}.`);
        setGameState('difficulty_selection');
        logAnalyticsEvent('select_category', {
            category_topic_value: parentCategory.topicValue,
            category_name: parentCategory.name[locale],
            is_custom_topic: false,
            played_as_parent: true
        });
    } else {
        console.warn("[DEBUG] handlePlayParentCategory: No parent category found in breadcrumb.");
    }
  };

  const handleGoBackFromSubcategories = () => {
    if (currentBreadcrumb.length <= 1) {
      setCurrentBreadcrumb([]);
      setCategoriesForCurrentView(topLevelCategories);
      console.log("[DEBUG] handleGoBackFromSubcategories: Navigated to top level categories.");
    } else {
      const newBreadcrumb = currentBreadcrumb.slice(0, -1);
      setCurrentBreadcrumb(newBreadcrumb);
      const newParent = newBreadcrumb.at(-1);
      if (newParent) {
        const children = allAppCategories.filter(cat => cat.parentTopicValue === newParent.topicValue);
        setCategoriesForCurrentView(children);
        console.log(`[DEBUG] handleGoBackFromSubcategories: Navigated back to parent: ${newParent.topicValue}, showing ${children.length} children.`);
      } else {
        setCategoriesForCurrentView(topLevelCategories);
        console.log("[DEBUG] handleGoBackFromSubcategories: Navigated to top level (newParent was null after slice).");
      }
    }
  };


  const handleDifficultySelect = async (mode: DifficultyMode) => {
    setSelectedDifficultyMode(mode);
    const isCustom = currentCategoryDetails?.isCustomActive || false;
    const initialDifficulty: DifficultyLevel = isCustom ? (mode as DifficultyLevel) : (mode === "adaptive" ? "medium" : mode);
    setCurrentDifficultyLevel(initialDifficulty);

    setAskedQuestionIdsFromDB([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(1);
    console.log(`[DEBUG] handleDifficultySelect: Mode: ${mode}, Initial Difficulty: ${initialDifficulty} for topicValue: ${currentTopicValue}, Custom: ${isCustom}`);

    logAnalyticsEvent('start_game_with_difficulty', {
      category_topic_value: currentTopicValue,
      category_name: currentCategoryDetails?.name[locale] || currentTopicValue,
      difficulty_mode_selected: mode,
      initial_difficulty_level: initialDifficulty,
      is_custom_topic: isCustom,
    });

    if (isCustom && currentCategoryDetails) {
      const existingQuestionsForDifficulty = await getCustomQuestionFromDB(currentTopicValue, initialDifficulty, []);
      if (existingQuestionsForDifficulty) {
        console.log(`[DEBUG] handleDifficultySelect: Custom topic ${currentTopicValue} - ${initialDifficulty} questions already in IDB for this session. Will use them.`);
        fetchAndSetNextQuestionForGame(currentTopicValue, initialDifficulty, currentCategoryDetails);
        return;
      }

      setGameState('loading_custom_batch');
      console.log(`[DEBUG] handleDifficultySelect: Custom topic game. GameState to loading_custom_batch for ${currentCategoryDetails.topicValue}.`);
      const inputForAI: GenerateTriviaQuestionsInput = {
        topic: currentCategoryDetails.name.en,
        previousQuestions: [],
        previousCorrectAnswers: [],
        targetDifficulty: initialDifficulty,
        count: CUSTOM_TOPIC_QUESTIONS_TO_GENERATE,
        modelName: DEFAULT_MODEL_FOR_GAME,
        categoryInstructions: currentCategoryDetails.detailedPromptInstructions,
      };

      try {
        const newQuestionsArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionsArray && newQuestionsArray.length > 0) {
          const questionsToSave: CustomQuestion[] = newQuestionsArray.map(q => ({
            ...q,
            id: crypto.randomUUID(),
            customTopicValue: currentTopicValue,
          }));

          await saveCustomQuestionsToDB(questionsToSave);
          console.log(`[DEBUG] handleDifficultySelect: Saved ${questionsToSave.length} custom questions to IDB for ${currentTopicValue} - ${initialDifficulty}.`);
          fetchAndSetNextQuestionForGame(currentTopicValue, initialDifficulty, currentCategoryDetails);
        } else {
          setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionsForCustomTopic'), isCorrect: false });
          setGameState('error');
          console.warn(`[DEBUG] handleDifficultySelect: No questions generated for custom topic ${currentCategoryDetails.topicValue}. GameState to error.`);
          setCurrentQuestionNumberInGame(0);
        }
      } catch (genkitError) {
        console.error(`[DEBUG] handleDifficultySelect: Failed to generate batch for custom topic "${currentCategoryDetails.topicValue}":`, genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        setCurrentQuestionNumberInGame(0);
      }
    } else {
      console.log(`[DEBUG] handleDifficultySelect: Predefined topic game. Calling fetchAndSetNextQuestionForGame for ${currentTopicValue}.`);
      fetchAndSetNextQuestionForGame(currentTopicValue, initialDifficulty, currentCategoryDetails);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing' || currentCorrectShuffledIndex === null) return;

    clearTimer();
    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === currentCorrectShuffledIndex;
    const correctAnswerTextInLocale = questionData.correctAnswer[locale];
    const explanationInLocale = questionData.explanation[locale];

    logAnalyticsEvent('answer_question', {
      category_topic_value: currentTopicValue,
      category_name: currentCategoryDetails?.name[locale] || currentTopicValue,
      question_difficulty: questionData.difficulty,
      is_correct: isCorrect,
      timed_out: false,
      question_id: questionData.id,
      is_custom_topic: currentCategoryDetails?.isCustomActive || false,
    });

    setQuestionsAnsweredThisGame(prev => prev + 1);

    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: t('correct'), isCorrect: true, explanation: explanationInLocale });
      if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
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
      if (selectedDifficultyMode === "adaptive" && !(currentCategoryDetails?.isCustomActive)) {
        const currentIndex = DIFFICULTY_LEVELS_ORDER.indexOf(currentDifficultyLevel);
        if (currentIndex > 0) {
          setCurrentDifficultyLevel(DIFFICULTY_LEVELS_ORDER[currentIndex - 1]!);
        }
      }
    }
    setGameState('showing_feedback');
    console.log(`[DEBUG] handleAnswerSelect: Answer ${isCorrect ? 'correct' : 'incorrect'}. GameState to showing_feedback.`);
  };

  const handleNextQuestion = () => {
    console.log(`[DEBUG] handleNextQuestion: Questions answered: ${questionsAnsweredThisGame}, Total in game: ${QUESTIONS_PER_GAME}`);
    if (questionsAnsweredThisGame >= QUESTIONS_PER_GAME) {
      setGameState('game_over');
      console.log("[DEBUG] handleNextQuestion: Game over. GameState to game_over.");
      logAnalyticsEvent('game_over', {
        category_topic_value: currentTopicValue,
        category_name: currentCategoryDetails?.name[locale] || currentTopicValue,
        final_score_correct: score.correct,
        final_score_incorrect: score.incorrect,
        difficulty_mode: selectedDifficultyMode,
        final_difficulty_level: currentDifficultyLevel,
        is_custom_topic: currentCategoryDetails?.isCustomActive || false,
      });
    } else {
      setCurrentQuestionNumberInGame(prev => prev + 1);
      fetchAndSetNextQuestionForGame(currentTopicValue, currentDifficultyLevel, currentCategoryDetails);
    }
  };

  const handlePlayAgainSameSettings = async () => {
    console.log("[DEBUG] handlePlayAgainSameSettings: Starting new game with same settings.");

    setScore({ correct: 0, incorrect: 0 });
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(1);

    if (!(currentCategoryDetails?.isCustomActive) && currentCategoryDetails && 'topicValue' in currentCategoryDetails && !downloadedPredefinedTopicValues.has(currentCategoryDetails.topicValue)) {
        console.log(`[DEBUG] handlePlayAgainSameSettings: Predefined category ${currentCategoryDetails.topicValue} needs download check.`);
        const downloadSuccess = await downloadQuestionsForTopic(currentCategoryDetails as CategoryDefinition);
        if (!downloadSuccess) {
          console.warn(`[DEBUG] handlePlayAgainSameSettings: Download process failed. Cannot play again.`);
          setGameState('category_selection');
          return;
        }
    }

    console.log(`[DEBUG] handlePlayAgainSameSettings: Fetching new question for ${currentTopicValue}, diff ${currentDifficultyLevel}.`);
    fetchAndSetNextQuestionForGame(currentTopicValue, currentDifficultyLevel, currentCategoryDetails);
  };

  const handleNewGameFullReset = () => {
    console.log("[DEBUG] handleNewGameFullReset: Resetting game state completely.");
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
    setTimeLeft(null);
    setIsHintVisible(false);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);
    setCustomTopicToConfirm(null);
    setIsCustomTopicValidating(false);
     getCustomTopicsMeta().then(setUserGeneratedCustomTopics).catch(e => console.error("Error reloading custom topics meta on full reset", e));
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
    correctAnswerIndex: currentCorrectShuffledIndex ?? 0, // Fallback, should not happen in practice
    explanation: questionData.explanation[locale],
    difficulty: questionData.difficulty,
    hint: questionData.hint?.[locale],
  } : null;


  if (gameState === 'initial_loading') {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen text-foreground">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (gameState === 'downloading_category_questions' || gameState === 'validating_custom_topic') {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-screen text-foreground">
        <Card className="p-8 text-center shadow-xl max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center">
            { gameState === 'downloading_category_questions' && <DownloadCloud className="h-16 w-16 text-primary mx-auto mb-4" /> }
            { gameState === 'validating_custom_topic' && <Sparkles className="h-16 w-16 text-primary mx-auto mb-4" /> }
            <p className="mt-4 text-xl font-semibold text-muted-foreground">
              {gameState === 'validating_custom_topic' ? t('validatingCustomTopic') : t('downloadingCategoryQuestions', { categoryName: currentCategoryDetails?.name[locale] || '...' })}
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

      {gameState !== 'category_selection' && gameState !== 'difficulty_selection' && gameState !== 'loading_custom_batch' && gameState !== 'loading_question' && gameState !== 'initial_loading' && gameState !== 'downloading_category_questions' && gameState !== 'game_over' && gameState !== 'confirming_custom_topic' && gameState !== 'validating_custom_topic' && (
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
            onCustomTopicSubmit={handleCustomTopicFormSubmit}
            onPlayParentCategory={currentBreadcrumb.length > 0 ? handlePlayParentCategory : undefined}
            onGoBack={currentBreadcrumb.length > 0 ? handleGoBackFromSubcategories : undefined}
            currentLocale={locale}
            isCustomTopicValidating={isCustomTopicValidating}
            userGeneratedCustomTopics={userGeneratedCustomTopics}
            onSelectUserGeneratedCustomTopic={handleUserGeneratedCustomTopicSelect}
          />
        )}
        {gameState === 'confirming_custom_topic' && customTopicToConfirm && (
          <Card className="w-full shadow-xl animate-fadeIn">
            <CardHeader>
              <CardTitle className="font-headline text-3xl text-center text-primary">{t('confirmCustomTopicTitle')}</CardTitle>
              <CardDescription className="text-center">
                {t('confirmCustomTopicDescription', { topicName: customTopicToConfirm.name[locale] })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1 text-lg">{t('customTopicRefinedNameLabel')}:</h3>
                <p className="text-muted-foreground text-center text-xl py-2 px-4 border rounded-md bg-secondary">
                  {customTopicToConfirm.name[locale]}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-lg">{t('customTopicInstructionsLabel')}:</h3>
                <Card className="bg-muted/50 p-3 max-h-40 overflow-y-auto">
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {customTopicToConfirm.instructions}
                  </p>
                </Card>
              </div>
               <p className="text-xs text-muted-foreground text-center">{t('customTopicConfirmNote', { count: CUSTOM_TOPIC_QUESTIONS_TO_GENERATE})}</p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <Button onClick={handleConfirmCustomTopic} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
                <Sparkles className="mr-2 h-4 w-4" />
                {t('customTopicConfirmButton')}
              </Button>
              <Button onClick={handleCancelCustomTopicConfirmation} variant="outline" className="w-full sm:w-auto">
                <ThumbsDown className="mr-2 h-4 w-4" />
                {t('customTopicCancelButton')}
              </Button>
            </CardFooter>
          </Card>
        )}
        {gameState === 'difficulty_selection' && (
          <Card className="w-full shadow-xl animate-fadeIn">
            <CardHeader>
              <CardTitle className="font-headline text-3xl text-center text-primary">{t('selectDifficultyTitle')}</CardTitle>
              <CardDescription className="text-center">{t('selectDifficultyDescription', { topic: currentCategoryDetails?.name[locale] || currentTopicValue })}</CardDescription>
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
              {!(currentCategoryDetails?.isCustomActive) && (
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center h-16 text-lg group hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleDifficultySelect("adaptive")}
                >
                  <Zap className="mr-3 h-6 w-6 text-primary group-hover:text-accent-foreground" />
                  {t('difficultyModeAdaptive')}
                </Button>
              )}
            </CardContent>
            <CardFooter>
              <Button variant="link" onClick={() => {
                 console.log("[DEBUG] Back to category selection clicked from difficulty screen.");
                setGameState('category_selection');
                if (currentCategoryDetails?.isCustomActive) {
                    setCurrentCategoryDetails(null);
                    setCustomTopicInput('');
                    setCurrentTopicValue('');
                }
                else if (currentBreadcrumb.length > 1 && currentCategoryDetails && 'parentTopicValue' in currentCategoryDetails && (currentCategoryDetails as CategoryDefinition).parentTopicValue) {
                   const parentOfCurrent = allAppCategories.find(c => c.topicValue === (currentCategoryDetails as CategoryDefinition).parentTopicValue);
                   if(parentOfCurrent){
                     setCurrentBreadcrumb(prev => prev.slice(0, -1));
                     setCategoriesForCurrentView(allAppCategories.filter(c => c.parentTopicValue === parentOfCurrent.topicValue));
                     console.log(`[DEBUG] Restored view to subcategories of ${parentOfCurrent.topicValue}`);
                   } else {
                     setCategoriesForCurrentView(topLevelCategories);
                     setCurrentBreadcrumb([]);
                     console.log("[DEBUG] Restored view to top level (parent lookup failed).");
                   }
                } else if (currentBreadcrumb.length > 0 && !(currentCategoryDetails?.isCustomActive)) {
                    setCategoriesForCurrentView(topLevelCategories);
                    setCurrentBreadcrumb([]);
                    console.log("[DEBUG] Restored view to top level (was playing a top-level category).");
                }
                 else {
                   setCategoriesForCurrentView(topLevelCategories);
                   setCurrentBreadcrumb([]);
                   console.log("[DEBUG] Restored view to top level categories from difficulty screen (default fallback).");
                }
              }} className="mx-auto text-sm">
                <ArrowLeft className="mr-2 h-4 w-4" /> {t('backToCategorySelection')}
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
                  topic: currentCategoryDetails?.name[locale] || currentTopicValue,
                  difficulty: selectedDifficultyMode === 'adaptive' && !(currentCategoryDetails?.isCustomActive) ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any)
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
                  count: CUSTOM_TOPIC_QUESTIONS_TO_GENERATE,
                  topic: currentCategoryDetails?.name[locale] || currentTopicValue,
                  difficulty: selectedDifficultyMode === 'adaptive' && !(currentCategoryDetails?.isCustomActive) ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any)
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
            categoryTopicValue={currentTopicValue}
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
                {t('gameOverTopic', { topic: currentCategoryDetails?.name[locale] || currentTopicValue, difficulty: selectedDifficultyMode === 'adaptive' && !(currentCategoryDetails?.isCustomActive) ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any) })}
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
              {currentTopicValue &&
              gameState === 'error' &&
              !feedback.message.includes(t('errorLoadingCategories')) &&
              feedback.detailedMessage !== t('errorNoMoreQuestionsForCustomTopicDifficulty', { difficulty: t(`difficultyLevels.${currentDifficultyLevel}` as any) as string, topic: currentCategoryDetails?.name[locale] || currentTopicValue }) &&
              (
                <Button
                  onClick={() => {
                    fetchAndSetNextQuestionForGame(currentTopicValue, currentDifficultyLevel, currentCategoryDetails);
                  }}
                  variant="outline"
                >
                  {t('errorTryAgainTopicWithMode', {
                    difficulty: selectedDifficultyMode === 'adaptive' && !(currentCategoryDetails?.isCustomActive) ? t('difficultyModeAdaptive') : t(`difficultyLevels.${currentDifficultyLevel}` as any),
                    topic: currentCategoryDetails?.name[locale] || currentTopicValue,
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
