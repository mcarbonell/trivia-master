
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
import { ArrowLeft, Loader2, Sparkles, ListChecks, Trash2 } from 'lucide-react';
import type { CustomTopicMeta } from '@/services/indexedDBService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const getIcon = (iconName: string | undefined): LucideIcon => {
  if (!iconName) return LucideIcons.HelpCircle; // Default if no iconName
  const IconComponent = (LucideIcons as any)[iconName];
  return IconComponent || LucideIcons.HelpCircle; 
};

interface CategorySelectorProps {
  categoriesToDisplay: CategoryDefinition[];
  currentParent: CategoryDefinition | null;
  customTopicInput: string;
  onCustomTopicChange: (value: string) => void;
  onSelectCategory: (category: CategoryDefinition) => void;
  onCustomTopicSubmit: (topic: string) => void;
  onPlayParentCategory?: () => void;
  onGoBack?: () => void;
  currentLocale: AppLocale;
  isCustomTopicValidating: boolean;
  userGeneratedCustomTopics: CustomTopicMeta[];
  onSelectUserGeneratedCustomTopic: (topicMeta: CustomTopicMeta) => void;
  onDeleteCustomTopic: (topicValue: string) => void;
}

export function CategorySelector({
  categoriesToDisplay,
  currentParent,
  customTopicInput,
  onCustomTopicChange,
  onSelectCategory,
  onCustomTopicSubmit,
  onPlayParentCategory,
  onGoBack,
  currentLocale,
  isCustomTopicValidating,
  userGeneratedCustomTopics,
  onSelectUserGeneratedCustomTopic,
  onDeleteCustomTopic,
}: CategorySelectorProps) {
  const t = useTranslations();
  const tCommon = useTranslations();

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (customTopicInput.trim()) {
      onCustomTopicSubmit(customTopicInput.trim());
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
             <ListChecks className="mr-2 h-5 w-5" />
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

        {!currentParent && userGeneratedCustomTopics && userGeneratedCustomTopics.length > 0 && (
          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-3 text-lg text-center">{t('savedCustomTopicsTitle')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <TooltipProvider delayDuration={100}>
              {userGeneratedCustomTopics.map((topicMeta) => {
                const IconComponent = getIcon(topicMeta.icon || 'Sparkles');
                return (
                  <div key={topicMeta.customTopicValue} className="relative group/item">
                    <Button
                      variant="outline"
                      className="flex flex-col items-center justify-center h-28 p-4 hover:bg-accent hover:text-accent-foreground transition-all duration-200 group [&_svg]:h-8 [&_svg]:w-8 w-full"
                      onClick={() => onSelectUserGeneratedCustomTopic(topicMeta)}
                    >
                      <IconComponent className="mb-2 text-primary group-hover:text-accent-foreground transition-colors h-8 w-8" />
                      <span className="text-sm font-medium text-center">{topicMeta.name[currentLocale]}</span>
                    </Button>
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={t('deleteCustomTopicButtonTooltip') as string}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('deleteCustomTopicButtonTooltip')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('deleteCustomTopicConfirmTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('deleteCustomTopicConfirmDescription', { topicName: topicMeta.name[currentLocale] })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>{tCommon('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCustomTopic(topicMeta.customTopicValue);
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            {tCommon('deleteButton')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
              </TooltipProvider>
            </div>
          </div>
        )}

        {!currentParent && ( 
          <form onSubmit={handleFormSubmit} className="space-y-4 pt-4 border-t">
            <div>
              <Label htmlFor="custom-topic" className="font-semibold mb-1 block">{t('customTopicLabel')}</Label>
               <p className="text-xs text-muted-foreground mb-2">
                {t('customTopicExplanation')}
              </p>
              <Input
                id="custom-topic"
                type="text"
                placeholder={t('customTopicPlaceholder')}
                value={customTopicInput}
                onChange={(e) => onCustomTopicChange(e.target.value)}
                className="bg-input"
                disabled={isCustomTopicValidating}
              />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={!customTopicInput.trim() || isCustomTopicValidating}>
              {isCustomTopicValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Sparkles className="mr-2 h-4 w-4" />
              {t('customTopicButton')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
