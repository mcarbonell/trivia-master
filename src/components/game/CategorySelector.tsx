
"use client";

import { useMemo } from 'react';
import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react"; 
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import type { CategoryDefinition } from "@/types";
import type { AppLocale } from '@/lib/i18n-config';
import { ArrowLeft } from 'lucide-react';

const getIcon = (iconName: string): LucideIcon => {
  const IconComponent = (LucideIcons as any)[iconName];
  return IconComponent || LucideIcons.HelpCircle; 
};

interface CategorySelectorProps {
  categoriesToDisplay: CategoryDefinition[];
  currentParent: CategoryDefinition | null;
  customTopicInput: string;
  onCustomTopicChange: (value: string) => void;
  onSelectCategory: (category: CategoryDefinition) => void;
  onPlayParentCategory?: () => void;
  onGoBack?: () => void;
  currentLocale: AppLocale;
}

export function CategorySelector({
  categoriesToDisplay,
  currentParent,
  customTopicInput,
  onCustomTopicChange,
  onSelectCategory,
  onPlayParentCategory,
  onGoBack,
  currentLocale,
}: CategorySelectorProps) {
  const t = useTranslations();

  const handleCustomTopicSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (customTopicInput.trim()) {
      // Pass a temporary CategoryDefinition-like object for custom topics
      onSelectCategory({
        id: customTopicInput.trim(), // Use input as ID for custom
        topicValue: customTopicInput.trim(),
        name: { en: customTopicInput.trim(), es: customTopicInput.trim() },
        icon: 'Lightbulb', // Default icon for custom
        detailedPromptInstructions: 'User-defined custom topic.',
        isPredefined: false
      });
    }
  };

  const categoryItems = useMemo(() => {
    return categoriesToDisplay.map(category => ({
      ...category,
      ResolvedIcon: getIcon(category.icon),
    }));
  }, [categoriesToDisplay]);

  const pageTitle = currentParent 
    ? t('subcategoryPageTitle', { parentName: currentParent.name[currentLocale] }) 
    : t('categorySelectorTitle');
  
  const pageDescription = currentParent 
    ? t('subcategoryPageDescription', { parentName: currentParent.name[currentLocale] })
    : t('categorySelectorDescription');


  return (
    <Card className="w-full shadow-xl animate-fadeIn">
      <CardHeader>
        <div className="flex items-center justify-between">
          {currentParent && onGoBack && (
            <Button variant="ghost" size="icon" onClick={onGoBack} className="mr-2 -ml-2">
              <ArrowLeft className="h-6 w-6" />
              <span className="sr-only">{t('backButton')}</span>
            </Button>
          )}
          <div className="flex-grow text-center">
            <CardTitle className="font-headline text-3xl text-primary">{pageTitle}</CardTitle>
            {pageDescription && <CardDescription className="mt-1">{pageDescription}</CardDescription>}
          </div>
          {currentParent && onGoBack && <div className="w-10"/> /* Spacer to balance back button */}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentParent && onPlayParentCategory && (
          <Button
            variant="default"
            className="w-full h-16 text-lg bg-primary hover:bg-primary/90 text-primary-foreground mb-4"
            onClick={onPlayParentCategory}
          >
            {t('playAllFromParentButton', { parentName: currentParent.name[currentLocale] })}
          </Button>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {categoryItems.map((category) => (
            <Button
              key={category.topicValue}
              variant="outline"
              className="flex flex-col items-center justify-center h-28 p-4 hover:bg-accent hover:text-accent-foreground transition-all duration-200 group [&_svg]:h-8 [&_svg]:w-8"
              onClick={() => onSelectCategory(category)}
            >
              <category.ResolvedIcon className="mb-2 text-primary group-hover:text-accent-foreground transition-colors h-8 w-8" />
              <span className="text-sm font-medium text-center">{category.name[currentLocale]}</span>
            </Button>
          ))}
        </div>
        {!currentParent && ( // Only show custom topic input on top level
          <form onSubmit={handleCustomTopicSubmit} className="space-y-4 pt-4 border-t">
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
        )}
      </CardContent>
    </Card>
  );
}

