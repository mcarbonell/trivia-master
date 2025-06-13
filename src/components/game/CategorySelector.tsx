
"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

interface Category {
  name: string; // This will now be the translated name
  icon: LucideIcon;
  topicValue: string; // This remains the English value for the AI
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
  const t = useTranslations();

  const handleCustomTopicSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (customTopicInput.trim()) {
      onSelectTopic(customTopicInput.trim());
    }
  };

  return (
    <Card className="w-full shadow-xl">
      <CardHeader>
        <CardTitle className="font-headline text-3xl text-center text-primary">{t('categorySelectorTitle')}</CardTitle>
        <CardDescription className="text-center">{t('categorySelectorDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {predefinedCategories.map((category) => (
            <Button
              key={category.topicValue} // Use topicValue for key as name can change with locale
              variant="outline"
              className="flex flex-col items-center justify-center h-28 p-4 hover:bg-accent hover:text-accent-foreground transition-all duration-200 group [&_svg]:h-8 [&_svg]:w-8"
              onClick={() => onSelectTopic(category.topicValue)}
            >
              <category.icon className="mb-2 text-primary group-hover:text-accent-foreground transition-colors h-8 w-8" />
              <span className="text-sm font-medium text-center">{category.name}</span>
            </Button>
          ))}
        </div>
        <form onSubmit={handleCustomTopicSubmit} className="space-y-4">
          <div>
            <Label htmlFor="custom-topic" className="font-semibold mb-1 block">{t('customTopicLabel')}</Label>
            <Input
              id="custom-topic"
              type="text"
              placeholder={t('customTopicPlaceholder')}
              value={customTopicInput}
              onChange={(e) => onCustomTopicChange(e.target.value)}
              className="bg-input"
            />
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={!customTopicInput.trim()}>
            {t('customTopicButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
