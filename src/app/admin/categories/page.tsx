// src/app/admin/categories/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getAppCategories } from '@/services/categoryService';
import type { CategoryDefinition } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/lib/i18n-config';

export default function AdminCategoriesPage() {
  const t = useTranslations('AdminCategoriesPage');
  const locale = useLocale() as AppLocale;
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedCategories = await getAppCategories();
        setCategories(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories:", err);
        setError(t('errorLoading'));
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, [t]);

  // Placeholder functions for CRUD operations
  const handleAddCategory = () => {
    // TODO: Implement add category functionality
    console.log("Add new category clicked");
  };

  const handleEditCategory = (categoryId: string) => {
    // TODO: Implement edit category functionality
    console.log("Edit category clicked:", categoryId);
  };

  const handleDeleteCategory = (categoryId: string) => {
    // TODO: Implement delete category functionality
    console.log("Delete category clicked:", categoryId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={handleAddCategory}>
          <PlusCircle className="mr-2 h-5 w-5" />
          {t('addButton')}
        </Button>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{t('categoriesListTitle')}</CardTitle>
          <CardDescription>{t('categoriesListDescription', { count: categories.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-muted-foreground">{t('noCategories')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tableName')}</TableHead>
                  <TableHead>{t('tableTopicValue')}</TableHead>
                  <TableHead>{t('tableIcon')}</TableHead>
                  <TableHead className="text-center">{t('tableIsPredefined')}</TableHead>
                  <TableHead className="text-right">{t('tableActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name[locale]}</TableCell>
                    <TableCell>{category.topicValue}</TableCell>
                    <TableCell>{category.icon}</TableCell>
                    <TableCell className="text-center">{category.isPredefined ? t('yes') : t('no')}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditCategory(category.id)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteCategory(category.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
