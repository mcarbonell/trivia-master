"use client";

import { useState, useEffect } from "react";
import { generateTriviaQuestion, type GenerateTriviaQuestionOutput } from "@/ai/flows/generate-trivia-question";
import { CategorySelector } from "@/components/game/CategorySelector";
import { QuestionCard } from "@/components/game/QuestionCard";
import { ScoreDisplay } from "@/components/game/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

const PREDEFINED_CATEGORIES = [
  { name: "Science", icon: Lightbulb, topicValue: "Science" },
  { name: "History", icon: Landmark, topicValue: "World History" },
  { name: "Sports", icon: Trophy, topicValue: "Sports" },
  { name: "Movies", icon: Film, topicValue: "Movies" },
  { name: "Geography", icon: Globe2, topicValue: "Geography" },
  { name: "Music", icon: Music, topicValue: "Popular Music History" },
];

type GameState = 'category_selection' | 'loading_question' | 'playing' | 'showing_feedback' | 'error';

export default function TriviaPage() {
  const [gameState, setGameState] = useState<GameState>('category_selection');
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [questionData, setQuestionData] = useState<GenerateTriviaQuestionOutput | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [feedback, setFeedback] = useState<{ message: string; isCorrect: boolean; detailedMessage?: string } | null>(null);
  const [customTopicInput, setCustomTopicInput] = useState('');

  const fetchQuestion = async (topic: string) => {
    setGameState('loading_question');
    setSelectedAnswerIndex(null);
    setFeedback(null);
    try {
      const data = await generateTriviaQuestion({ topic });
      setQuestionData(data);
      setGameState('playing');
    } catch (err) {
      console.error("Failed to generate question:", err);
      setFeedback({ message: "Error loading question.", detailedMessage: "Could not fetch a new question. Please check your connection or try a different topic.", isCorrect: false });
      setGameState('error');
    }
  };

  const handleStartGame = (topic: string) => {
    setCurrentTopic(topic);
    setScore({ correct: 0, incorrect: 0 }); // Reset score for a new topic game
    fetchQuestion(topic);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (!questionData || gameState !== 'playing') return;

    setSelectedAnswerIndex(answerIndex);
    const isCorrect = answerIndex === questionData.correctAnswerIndex;
    
    if (isCorrect) {
      setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setFeedback({ message: "Correct!", isCorrect: true });
    } else {
      setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      setFeedback({ 
        message: "Incorrect!", 
        detailedMessage: `The correct answer was: ${questionData.answers[questionData.correctAnswerIndex]}`, 
        isCorrect: false 
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
  };
  
  // Add keyframes and animation classes to globals.css or a <style jsx global> tag if preferred.
  // For simplicity, they could be in globals.css.
  // Example:
  // @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  // .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
  // @keyframes pulseOnce { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
  // .animate-pulseOnce { animation: pulseOnce 0.6s ease-in-out; }
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }

      @keyframes pulseOnce {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      .animate-pulseOnce { animation: pulseOnce 0.6s ease-in-out; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);


  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen text-foreground">
      <header className="my-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-headline font-bold text-primary">AI Trivia Master</h1>
        <p className="text-muted-foreground mt-1">Test your knowledge with AI-generated questions!</p>
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
              <p className="mt-6 text-xl font-semibold text-muted-foreground">Generating your question on "{currentTopic}"...</p>
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
              {currentTopic && <Button onClick={() => fetchQuestion(currentTopic)} variant="outline">Try Again Topic: "{currentTopic}"</Button>}
              <Button onClick={handleNewGame} className="bg-primary hover:bg-primary/90 text-primary-foreground">Choose New Topic</Button>
            </CardFooter>
          </Card>
        )}
      </main>

      <footer className="mt-auto pt-8 pb-4 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} AI Trivia Master. Powered by GenAI.</p>
      </footer>
    </div>
  );
}
