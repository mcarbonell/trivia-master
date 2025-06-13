"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Category {
  name: string;
  icon: LucideIcon;
  topicValue: string;
}

interface CategorySelectorProps {
  predefinedCategories: Category[];
  customTopicInput: string;
  onCustomTopicChange: (value: string) => void;
  onSelectTopic: (topic: string) => void;
}

export function CategorySelector({
  predefinedCategories,
  customTopicInput,
  onCustomTopicChange,
  onSelectTopic,
}: CategorySelectorProps) {
  const handleCustomTopicSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (customTopicInput.trim()) {
      onSelectTopic(customTopicInput.trim());
    }
  };

  return (
    <Card className="w-full shadow-xl">
      <CardHeader>
        <CardTitle className="font-headline text-3xl text-center text-primary">Choose a Category</CardTitle>
        <CardDescription className="text-center">Or enter your own topic below.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {predefinedCategories.map((category) => (
            <Button
              key={category.name}
              variant="outline"
              className="flex flex-col items-center justify-center h-28 p-4 hover:bg-accent hover:text-accent-foreground transition-all duration-200 group"
              onClick={() => onSelectTopic(category.topicValue)}
            >
              <category.icon className="h-8 w-8 mb-2 text-primary group-hover:text-accent-foreground transition-colors" />
              <span className="text-sm font-medium text-center">{category.name}</span>
            </Button>
          ))}
        </div>
        <form onSubmit={handleCustomTopicSubmit} className="space-y-4">
          <div>
            <Label htmlFor="custom-topic" className="font-semibold mb-1 block">Custom Topic</Label>
            <Input
              id="custom-topic"
              type="text"
              placeholder="E.g., Ancient Rome, Quantum Physics"
              value={customTopicInput}
              onChange={(e) => onCustomTopicChange(e.target.value)}
              className="bg-input"
            />
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={!customTopicInput.trim()}>
            Start with Custom Topic
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
