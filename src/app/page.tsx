

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateTriviaQuestions, type GenerateTriviaQuestionOutput, type GenerateTriviaQuestionsInput, type DifficultyLevel } from "@/ai/flows/generate-trivia-question";
import { getPredefinedQuestionFromFirestore, getAllQuestionsForTopic, type PredefinedQuestion } from "@/services/triviaService";
import { getAppCategories } from "@/services/categoryService";
import { saveQuestionsToDB, getQuestionFromDB, clearAllQuestionsFromDB, saveCategoriesToCache, getCategoriesFromCache, clearCategoriesCache } from "@/services/indexedDBService"; 
import type { CategoryDefinition, DifficultyMode } from "@/types";
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

const CURRENT_CONTENT_VERSION = "v1.0.2"; // Increment if category structure/content in JSONs change significantly
const CONTENT_VERSION_STORAGE_KEY = 'downloadedContentVersion';
const DOWNLOADED_TOPICS_STORAGE_KEY = 'downloadedTopicValues_v1';


export default function TriviaPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [allAppCategories, setAllAppCategories] = useState<CategoryDefinition[]>([]);
  const [topLevelCategories, setTopLevelCategories] = useState<CategoryDefinition[]>([]);
  const [categoriesForCurrentView, setCategoriesForCurrentView] = useState<CategoryDefinition[]>([]);
  const [currentBreadcrumb, setCurrentBreadcrumb] = useState<CategoryDefinition[]>([]);
  
  const [gameState, setGameState] = useState<GameState>('initial_loading');
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

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    console.log("[DEBUG] Initial setup starting...");

    const performInitialSetup = async () => {
      setGameState('initial_loading');
      console.log("[DEBUG] performInitialSetup: GameState set to initial_loading. Current content version const: ", CURRENT_CONTENT_VERSION);

      let localDownloadedTopics: Set<string> = new Set();
      let storedContentVersion: string | null = null;

      if (typeof window !== 'undefined') {
        storedContentVersion = localStorage.getItem(CONTENT_VERSION_STORAGE_KEY);
        const storedTopicsString = localStorage.getItem(DOWNLOADED_TOPICS_STORAGE_KEY);
        if (storedTopicsString) {
          try {
            localDownloadedTopics = new Set(JSON.parse(storedTopicsString));
          } catch (e) { console.error("Error parsing downloaded topics", e); localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY); }
        }
      }
      console.log(`[DEBUG] performInitialSetup: Stored content version from localStorage: ${storedContentVersion}`);

      if (storedContentVersion !== CURRENT_CONTENT_VERSION) {
        console.log(`[DEBUG] performInitialSetup: Content version mismatch. Stored: ${storedContentVersion}, Current: ${CURRENT_CONTENT_VERSION}. Clearing caches.`);
        if (typeof window !== 'undefined' && window.indexedDB) {
          try {
            await clearAllQuestionsFromDB();
            await clearCategoriesCache();
            console.log("[DEBUG] performInitialSetup: IndexedDB (questions & categories) cleared due to version mismatch.");
            localStorage.setItem(CONTENT_VERSION_STORAGE_KEY, CURRENT_CONTENT_VERSION); 
            localStorage.removeItem(DOWNLOADED_TOPICS_STORAGE_KEY); 
            localDownloadedTopics = new Set(); 
            toast({ title: t('toastSuccessTitle') as string, description: t('offlineContentVersionUpdated')});
          } catch (error) {
            console.error("[DEBUG] performInitialSetup: Error clearing IndexedDB for content update:", error);
            toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('offlineContentUpdateError') });
          }
        }
      }
      setDownloadedTopicValues(localDownloadedTopics);
      
      let categoriesToUse: CategoryDefinition[] | null = null;
      try {
        const cachedCategoriesData = await getCategoriesFromCache();
        if (cachedCategoriesData && storedContentVersion === CURRENT_CONTENT_VERSION) {
          console.log("[DEBUG] performInitialSetup: Using categories from IndexedDB cache.");
          categoriesToUse = cachedCategoriesData.categories;
        } else {
          console.log("[DEBUG] performInitialSetup: Fetching categories from Firestore.");
          categoriesToUse = await getAppCategories();
          if (categoriesToUse && categoriesToUse.length > 0) {
            await saveCategoriesToCache(categoriesToUse);
            console.log("[DEBUG] performInitialSetup: Categories fetched from Firestore and saved to cache.");
          }
        }

        if (categoriesToUse && categoriesToUse.length > 0) {
          setAllAppCategories(categoriesToUse);
          const topLevels = categoriesToUse.filter(cat => !cat.parentTopicValue);
          setTopLevelCategories(topLevels);
          setCategoriesForCurrentView(topLevels);
          console.log("[DEBUG] performInitialSetup: Categories processed. Top level categories:", topLevels.length);
          setGameState('category_selection');
          console.log("[DEBUG] performInitialSetup: GameState set to category_selection");
        } else {
          setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorNoCategoriesDefined'), isCorrect: false });
          setGameState('error'); 
          console.warn("[DEBUG] performInitialSetup: No categories found/defined. GameState set to error.");
        }
      } catch (error) {
        console.error("[DEBUG] performInitialSetup: Error during category loading/processing:", error);
        setFeedback({ message: t('errorLoadingCategories'), detailedMessage: t('errorLoadingCategoriesDetail'), isCorrect: false });
        setGameState('error');
      }
    };

    performInitialSetup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  const downloadQuestionsForTopic = async (categoryToDownload: CategoryDefinition): Promise<boolean> => {
    console.log(`[DEBUG] downloadQuestionsForTopic: Called for category: ${categoryToDownload.topicValue}`);
    
    if (downloadedTopicValues.has(categoryToDownload.topicValue) && localStorage.getItem(CONTENT_VERSION_STORAGE_KEY) === CURRENT_CONTENT_VERSION) {
      console.log(`[DEBUG] downloadQuestionsForTopic: Topic ${categoryToDownload.topicValue} already downloaded and version matches. Skipping download.`);
      return true; 
    }
    
    setGameState('downloading_category_questions');
    setLoadingMessage(t('downloadingCategoryQuestions', { categoryName: categoryToDownload.name[locale] }));
    console.log(`[DEBUG] downloadQuestionsForTopic: GameState set to downloading_category_questions for ${categoryToDownload.topicValue}`);

    try {
      console.log(`[DEBUG] downloadQuestionsForTopic: Calling getAllQuestionsForTopic for ${categoryToDownload.topicValue}`);
      const questions = await getAllQuestionsForTopic(categoryToDownload.topicValue);
      console.log(`[DEBUG] downloadQuestionsForTopic: Fetched ${questions.length} questions from Firestore for ${categoryToDownload.topicValue}.`);
      if (questions.length > 0) {
        await saveQuestionsToDB(questions);
        console.log(`[DEBUG] downloadQuestionsForTopic: Saved ${questions.length} questions to IndexedDB for ${categoryToDownload.topicValue}.`);
      } else {
         console.log(`[DEBUG] downloadQuestionsForTopic: No predefined questions found in Firestore for ${categoryToDownload.topicValue}. It will rely on AI generation if played directly or has no subcategories.`);
      }
      const newDownloadedTopics = new Set(downloadedTopicValues).add(categoryToDownload.topicValue);
      setDownloadedTopicValues(newDownloadedTopics);
      if(typeof window !== 'undefined') {
        localStorage.setItem(DOWNLOADED_TOPICS_STORAGE_KEY, JSON.stringify(Array.from(newDownloadedTopics)));
      }
      
      if (questions.length > 0) {
        toast({ title: t('toastSuccessTitle') as string, description: t('categoryDownloadComplete', { categoryName: categoryToDownload.name[locale] }) });
      }
      console.log(`[DEBUG] downloadQuestionsForTopic: Successfully processed (downloaded or confirmed no questions) for ${categoryToDownload.topicValue}.`);
      return true;
    } catch (error) {
      console.error(`[DEBUG] downloadQuestionsForTopic: Error processing questions for topic ${categoryToDownload.topicValue}:`, error);
      toast({ variant: "destructive", title: t('toastErrorTitle') as string, description: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }) });
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('categoryDownloadError', { categoryName: categoryToDownload.name[locale] }), isCorrect: false });
      return false;
    } finally {
      setLoadingMessage(''); 
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
    console.log("[DEBUG] prepareAndSetQuestion: Setting question:", qData.id || "AI Generated", "for topic:", currentTopic);
    setQuestionData(qData);
    const questionTextInLocale = qData.question[locale] || `q_text_${Date.now()}`;
    if (qData.answers && typeof qData.correctAnswerIndex === 'number' && qData.answers[qData.correctAnswerIndex]) {
       const correctAnswerTextInLocale = qData.answers[qData.correctAnswerIndex]![locale];
       setAskedCorrectAnswerTexts(prev => [...new Set([...prev, correctAnswerTextInLocale])]);
    }

    setAskedQuestionTextsForAI(prev => [...new Set([...prev, questionTextInLocale])]);

    if (qData.id && !isCustomTopicGameActive) { 
      console.log(`[DEBUG] prepareAndSetQuestion: Adding Firestore ID ${qData.id} to askedFirestoreIds.`);
      setAskedFirestoreIds(prev => [...new Set([...prev, qData.id!])]);
    }
    setSelectedAnswerIndex(null);
    setFeedback(null);
    setTimeLeft(null);
    setIsHintVisible(false);
    setGameState('playing');
    console.log("[DEBUG] prepareAndSetQuestion: GameState set to playing");
  };

  const fetchPredefinedOrSingleAIQuestion = useCallback(async (topic: string, difficulty: DifficultyLevel, categoryDetailsForSelectedTopic: CategoryDefinition | null) => {
    setGameState('loading_question');
    console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Called for topic: ${topic}, difficulty: ${difficulty}, categoryDetails: ${categoryDetailsForSelectedTopic?.topicValue}`);
    
    let fetchedQuestionData: CurrentQuestionData | null = null;

    if (!isCustomTopicGameActive && categoryDetailsForSelectedTopic) {
      console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Attempting to get question from IndexedDB for topic ${topic}, difficulty ${difficulty}. Asked IDs:`, askedFirestoreIds);
      try {
        fetchedQuestionData = await getQuestionFromDB(topic, difficulty, askedFirestoreIds);
        if (fetchedQuestionData) {
          console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Found question in IndexedDB (ID: ${fetchedQuestionData.id})`);
        } else {
          console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: No unasked question found in IndexedDB for ${topic} - ${difficulty}.`);
        }
      } catch (indexedDbError) {
        console.warn(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Error fetching from IndexedDB for topic "${topic}", will fall back to Firestore/Genkit:`, indexedDbError);
      }
    } else if (isCustomTopicGameActive) {
       console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Custom topic game for ${topic}. Skipping IndexedDB check.`);
    } else {
      console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: No categoryDetailsForSelectedTopic for ${topic}. Skipping IndexedDB check because categoryDetails is null.`);
    }
    
    if (!fetchedQuestionData && !isCustomTopicGameActive && categoryDetailsForSelectedTopic) {
        console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Attempting to get question from Firestore for topic ${topic}, difficulty ${difficulty}.`);
        try {
          fetchedQuestionData = await getPredefinedQuestionFromFirestore(topic, askedFirestoreIds, difficulty);
           if (fetchedQuestionData) {
            console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Found question in Firestore (ID: ${fetchedQuestionData.id})`);
          } else {
            console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: No unasked question found in Firestore for ${topic} - ${difficulty}. Falling back to AI.`);
          }
        } catch (firestoreError) {
          console.warn(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Error fetching from Firestore for topic "${topic}", will fall back to Genkit:`, firestoreError);
        }
    }

    if (!fetchedQuestionData && (categoryDetailsForSelectedTopic || isCustomTopicGameActive)) {
      const instructions = categoryDetailsForSelectedTopic?.detailedPromptInstructions;
      const diffInstruction = categoryDetailsForSelectedTopic?.difficultySpecificGuidelines?.[difficulty];
      console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Falling back to Genkit AI for topic ${topic}, difficulty ${difficulty}. Category instructions: ${instructions ? 'Yes' : 'No'}`);
      
      const inputForAI: GenerateTriviaQuestionsInput = {
        topic,
        previousQuestions: askedQuestionTextsForAI,
        previousCorrectAnswers: askedCorrectAnswerTexts,
        targetDifficulty: difficulty,
        count: 1,
        modelName: DEFAULT_MODEL_FOR_GAME,
        categoryInstructions: instructions,
      };
      if (diffInstruction) {
        inputForAI.difficultySpecificInstruction = diffInstruction;
      }

      try {
        const newQuestionArray = await generateTriviaQuestions(inputForAI);
        if (newQuestionArray && newQuestionArray.length > 0) {
          fetchedQuestionData = newQuestionArray[0]!;
          console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: AI generated question for topic ${topic}.`);
        } else {
           console.log(`[DEBUG] fetchPredefinedOrSingleAIQuestion: AI generation returned no questions for ${topic}.`);
        }
      } catch (genkitError) {
        console.error(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Genkit AI fallback failed for topic "${topic}":`, genkitError);
      }
    }

    if (fetchedQuestionData) {
      prepareAndSetQuestion(fetchedQuestionData);
    } else {
      setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionForDifficulty', { difficulty: t(`difficultyLevels.${difficulty}` as any) as string }), isCorrect: false });
      setGameState('error');
      console.warn(`[DEBUG] fetchPredefinedOrSingleAIQuestion: Failed to fetch or generate any question for ${topic} - ${difficulty}. GameState set to error.`);
      setCurrentQuestionNumberInGame(prev => Math.max(0, prev - 1)); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, askedFirestoreIds, askedQuestionTextsForAI, askedCorrectAnswerTexts, t, logAnalyticsEvent, isCustomTopicGameActive]);


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

  
  const handleCategoryClick = async (category: CategoryDefinition) => {
    console.log(`[DEBUG] handleCategoryClick: Clicked category: ${category.topicValue} (${category.name[locale]}), Parent: ${category.parentTopicValue}`);
    const children = allAppCategories.filter(cat => cat.parentTopicValue === category.topicValue);
    const isCustomInputTopic = !allAppCategories.some(appCat => appCat.topicValue === category.topicValue); 

    setScore({ correct: 0, incorrect: 0 });
    setAskedFirestoreIds([]);
    setAskedQuestionTextsForAI([]);
    setAskedCorrectAnswerTexts([]);
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(0);
    setCustomTopicQuestionsCache([]);
    setCurrentBatchQuestionIndex(0);

    if (isCustomInputTopic) { 
        setCurrentTopic(category.topicValue); 
        setCurrentCategoryDetails(null); 
        setIsCustomTopicGameActive(true);
        console.log(`[DEBUG] handleCategoryClick: Custom input topic selected: ${category.topicValue}. GameState to difficulty_selection.`);
        setGameState('difficulty_selection');
         logAnalyticsEvent('select_category', {
            category_topic_value: category.topicValue,
            category_name: category.topicValue, 
            is_custom_topic: true
        });
    } else if (children.length > 0) { 
        setCurrentBreadcrumb(prev => [...prev, category]);
        setCategoriesForCurrentView(children);
        setGameState('category_selection'); 
        console.log(`[DEBUG] handleCategoryClick: Category ${category.topicValue} has ${children.length} children. Navigating to subcategory view.`);
    } else { 
        const categoryToPlay = category;
        console.log(`[DEBUG] handleCategoryClick: Leaf category selected: ${categoryToPlay.topicValue}, downloaded: ${downloadedTopicValues.has(categoryToPlay.topicValue)}`);
        
        if (!downloadedTopicValues.has(categoryToPlay.topicValue)) {
            console.log(`[DEBUG] handleCategoryClick: Category ${categoryToPlay.topicValue} needs download.`);
            const downloadSuccess = await downloadQuestionsForTopic(categoryToPlay);
            if (!downloadSuccess) {
                console.warn(`[DEBUG] handleCategoryClick: Download process failed for ${categoryToPlay.topicValue}. Returning to category_selection.`);
                setGameState('category_selection'); 
                return;
            }
            console.log(`[DEBUG] handleCategoryClick: Download process completed for ${categoryToPlay.topicValue}.`);
        }
        
        setCurrentTopic(categoryToPlay.topicValue);
        setCurrentCategoryDetails(categoryToPlay);
        setCurrentBreadcrumb(prev => { 
            const newBreadcrumb = [...prev];
            if (!newBreadcrumb.find(bc => bc.topicValue === categoryToPlay.topicValue)) {
                newBreadcrumb.push(categoryToPlay);
            }
            return newBreadcrumb;
        });
        setIsCustomTopicGameActive(false);
        console.log(`[DEBUG] handleCategoryClick: Proceeding to difficulty_selection for ${categoryToPlay.topicValue}.`);
        setGameState('difficulty_selection');
        logAnalyticsEvent('select_category', { 
            category_topic_value: categoryToPlay.topicValue,
            category_name: categoryToPlay.name[locale],
            is_custom_topic: false,
        });
    }
  };

  const handlePlayParentCategory = async () => {
    const parentCategory = currentBreadcrumb.at(-1);
    if (parentCategory) {
        console.log(`[DEBUG] handlePlayParentCategory: Playing parent category: ${parentCategory.topicValue}, downloaded: ${downloadedTopicValues.has(parentCategory.topicValue)}`);
        setScore({ correct: 0, incorrect: 0 });
        setAskedFirestoreIds([]);
        setAskedQuestionTextsForAI([]);
        setAskedCorrectAnswerTexts([]);
        setQuestionsAnsweredThisGame(0);
        setCurrentQuestionNumberInGame(0);
        setCustomTopicQuestionsCache([]);
        setCurrentBatchQuestionIndex(0);

        if (!downloadedTopicValues.has(parentCategory.topicValue)) {
            console.log(`[DEBUG] handlePlayParentCategory: Parent category ${parentCategory.topicValue} needs download.`);
            const downloadSuccess = await downloadQuestionsForTopic(parentCategory);
            if (!downloadSuccess) {
                console.warn(`[DEBUG] handlePlayParentCategory: Download process failed for parent ${parentCategory.topicValue}. Returning to category_selection.`);
                setGameState('category_selection'); 
                return;
            }
             console.log(`[DEBUG] handlePlayParentCategory: Download process completed for parent ${parentCategory.topicValue}.`);
        }
        
        setCurrentTopic(parentCategory.topicValue);
        setCurrentCategoryDetails(parentCategory);
        setIsCustomTopicGameActive(false); 
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
    let initialDifficulty: DifficultyLevel;
    if (mode === "adaptive") {
      initialDifficulty = "medium";
    } else {
      initialDifficulty = mode;
    }
    setCurrentDifficultyLevel(initialDifficulty);
    setQuestionsAnsweredThisGame(0); 
    setCurrentQuestionNumberInGame(1); 
    console.log(`[DEBUG] handleDifficultySelect: Mode: ${mode}, Initial Difficulty: ${initialDifficulty} for topic: ${currentTopic}`);

    logAnalyticsEvent('start_game_with_difficulty', {
      category_topic_value: currentTopic,
      category_name: currentCategoryDetails?.name[locale] || currentTopic,
      difficulty_mode_selected: mode,
      initial_difficulty_level: initialDifficulty
    });

    if (isCustomTopicGameActive) {
      setGameState('loading_custom_batch');
      console.log(`[DEBUG] handleDifficultySelect: Custom topic game. GameState to loading_custom_batch for ${currentTopic}.`);
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
          console.log(`[DEBUG] handleDifficultySelect: Custom batch generated (${newQuestionsArray.length} questions). First question set.`);
        } else {
          setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorNoQuestionsForCustomTopic'), isCorrect: false });
          setGameState('error');
          console.warn(`[DEBUG] handleDifficultySelect: No questions generated for custom topic ${currentTopic}. GameState to error.`);
          setCurrentQuestionNumberInGame(0);
        }
      } catch (genkitError) {
        console.error(`[DEBUG] handleDifficultySelect: Failed to generate batch for custom topic "${currentTopic}":`, genkitError);
        setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorLoadingQuestionDetail'), isCorrect: false });
        setGameState('error');
        setCurrentQuestionNumberInGame(0);
      }
    } else { 
      console.log(`[DEBUG] handleDifficultySelect: Predefined/AI-single topic game. Calling fetchPredefinedOrSingleAIQuestion for ${currentTopic}.`);
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
    console.log(`[DEBUG] handleAnswerSelect: Answer ${isCorrect ? 'correct' : 'incorrect'}. GameState to showing_feedback.`);
  };

  const handleNextQuestion = () => {
    console.log(`[DEBUG] handleNextQuestion: Questions answered: ${questionsAnsweredThisGame}, Total: ${QUESTIONS_PER_GAME}`);
    if (questionsAnsweredThisGame >= QUESTIONS_PER_GAME) {
      setGameState('game_over');
      console.log("[DEBUG] handleNextQuestion: Game over. GameState to game_over.");
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
          console.log(`[DEBUG] handleNextQuestion: Custom topic. Setting next question from cache, index: ${nextIndex}.`);
        } else {
          console.error("[DEBUG] handleNextQuestion: Custom topic cache exhausted unexpectedly.");
          setFeedback({ message: t('errorLoadingQuestion'), detailedMessage: t('errorGeneric'), isCorrect: false });
          setGameState('error');
        }
      } else {
        console.log(`[DEBUG] handleNextQuestion: Predefined/AI-single topic. Fetching next question for ${currentTopic}, difficulty ${currentDifficultyLevel}.`);
        fetchPredefinedOrSingleAIQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
      }
    }
  };

  const handlePlayAgainSameSettings = async () => {
    console.log("[DEBUG] handlePlayAgainSameSettings: Starting new game with same settings.");
    if (!isCustomTopicGameActive && currentCategoryDetails) {
        if (!downloadedTopicValues.has(currentCategoryDetails.topicValue)) {
            console.log(`[DEBUG] handlePlayAgainSameSettings: Category ${currentCategoryDetails.topicValue} needs download check before playing again.`);
            const downloadSuccess = await downloadQuestionsForTopic(currentCategoryDetails);
            if (!downloadSuccess) {
              console.warn(`[DEBUG] handlePlayAgainSameSettings: Download process failed for ${currentCategoryDetails.topicValue}. Cannot play again.`);
              setGameState('category_selection'); 
              return;
            }
        }
    }
    
    setScore({ correct: 0, incorrect: 0 });
    setQuestionsAnsweredThisGame(0);
    setCurrentQuestionNumberInGame(1); 
    
    if (isCustomTopicGameActive) {
        if (customTopicQuestionsCache.length > 0 && customTopicQuestionsCache.length >= QUESTIONS_PER_GAME) {
            setCurrentBatchQuestionIndex(0); 
            prepareAndSetQuestion(customTopicQuestionsCache[0]!);
            console.log("[DEBUG] handlePlayAgainSameSettings: Custom topic. Using existing cache.");
        } else { 
            console.log("[DEBUG] handlePlayAgainSameSettings: Custom topic. Cache empty or insufficient. Regenerating batch.");
            handleDifficultySelect(selectedDifficultyMode!); 
        }
    } else { 
        console.log(`[DEBUG] handlePlayAgainSameSettings: Predefined/AI-single topic. Fetching new question for ${currentTopic}.`);
        fetchPredefinedOrSingleAIQuestion(currentTopic, currentDifficultyLevel, currentCategoryDetails);
    }
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
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
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
                 console.log("[DEBUG] Back to category selection clicked from difficulty screen.");
                setGameState('category_selection');
                if (currentBreadcrumb.length > 1 && currentCategoryDetails?.parentTopicValue) { 
                   // If we were playing a subcategory, go back to its parent's subcategory list
                   const parentOfCurrent = allAppCategories.find(c => c.topicValue === currentCategoryDetails.parentTopicValue);
                   if(parentOfCurrent){
                     setCurrentBreadcrumb(prev => prev.slice(0, -1));
                     setCategoriesForCurrentView(allAppCategories.filter(c => c.parentTopicValue === parentOfCurrent.topicValue));
                     console.log(`[DEBUG] Restored view to subcategories of ${parentOfCurrent.topicValue}`);
                   } else { // Fallback if parent lookup fails
                     setCategoriesForCurrentView(topLevelCategories);
                     setCurrentBreadcrumb([]);
                     console.log("[DEBUG] Restored view to top level (parent lookup failed).");
                   }
                } else if (currentBreadcrumb.length > 0 && !currentCategoryDetails?.parentTopicValue) {
                    // If we were playing a top-level category directly (no subcategory navigation involved before)
                    setCategoriesForCurrentView(topLevelCategories);
                    setCurrentBreadcrumb([]);
                    console.log("[DEBUG] Restored view to top level (was playing a top-level category).");
                }
                 else { // Default fallback: go to absolute top level
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

