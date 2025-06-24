// src/app/admin/users/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocaleUS } from 'date-fns/locale';
import { getAllUsers, updateUserRole } from '@/services/userService';
import type { UserData } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle, RefreshCw, ClipboardCopy, User, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const ITEMS_PER_PAGE = 10;

export default function AdminUsersPage() {
  const t = useTranslations('AdminUsersPage');
  const tCommon = useTranslations();
  const currentLocale = useLocale() as AppLocale;
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [roleChangeInfo, setRoleChangeInfo] = useState<{ userId: string; newRole: 'user' | 'admin'; userName: string } | null>(null);

  const dateLocale = currentLocale === 'es' ? esLocale : enLocaleUS;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(t('errorLoading'));
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: t('errorLoading') });
    } finally {
      setLoading(false);
    }
  }, [t, tCommon, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return users.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [users, currentPage]);

  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);

  const handleRoleChange = (userId: string, newRole: 'user' | 'admin') => {
    const userToChange = users.find(u => u.uid === userId);
    if (!userToChange) return;

    if (currentUser?.uid === userId) {
      toast({ variant: 'destructive', title: t('errorChangeOwnRoleTitle'), description: t('errorChangeOwnRoleDescription') });
      return;
    }

    setRoleChangeInfo({ userId, newRole, userName: userToChange.email });
    setIsConfirmDialogOpen(true);
  };

  const confirmRoleChange = async () => {
    if (!roleChangeInfo) return;

    try {
      await updateUserRole(roleChangeInfo.userId, roleChangeInfo.newRole);
      toast({
        title: tCommon('toastSuccessTitle') as string,
        description: t('toastUpdateSuccess', { email: roleChangeInfo.userName, role: t(`roles.${roleChangeInfo.newRole}`) }),
      });
      fetchUsers(); // Refresh user list
    } catch (err) {
      console.error("Error updating user role:", err);
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: t('toastUpdateError') });
    } finally {
      setIsConfirmDialogOpen(false);
      setRoleChangeInfo(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('uidCopied') });
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{tCommon('errorTitle')}</CardTitle></CardHeader>
        <CardContent><p className="text-destructive">{error}</p></CardContent>
        <CardFooter><Button onClick={fetchUsers} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />{tCommon('retryButton')}</Button></CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{t('usersListTitle')}</CardTitle>
          <CardDescription>{t('usersListDescription', { count: users.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {paginatedUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noUsersFound')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">{t('tableUser')}</TableHead>
                  <TableHead className="w-[20%] text-center">{t('tableRole')}</TableHead>
                  <TableHead className="w-[40%] hidden sm:table-cell">{t('tableCreatedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell>
                      <div className="font-medium">{user.email}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>{user.uid}</span>
                        <button onClick={() => copyToClipboard(user.uid)} title={t('copyUidTooltip')} className="opacity-50 hover:opacity-100">
                          <ClipboardCopy className="h-3 w-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Select
                        value={user.role}
                        onValueChange={(newRole: 'user' | 'admin') => handleRoleChange(user.uid, newRole)}
                        disabled={currentUser?.uid === user.uid}
                      >
                        <SelectTrigger className="h-8 text-xs w-full max-w-[120px] mx-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>{t('roles.user')}</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              <span>{t('roles.admin')}</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {user.createdAt ? format(new Date(user.createdAt), 'PPp', { locale: dateLocale }) : t('notAvailable')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {totalPages > 1 && (
          <CardFooter className="flex items-center justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {tCommon('AdminQuestionsPage.paginationInfo', { currentPage, totalPages, totalItems: users.length, item: "users" })}
            </div>
            <div className="space-x-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                {tCommon('AdminQuestionsPage.previousPage')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                {tCommon('AdminQuestionsPage.nextPage')}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
      
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmChangeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {roleChangeInfo?.newRole === 'admin' 
                ? t('confirmChangeDescriptionToAdmin', { email: roleChangeInfo.userName })
                : t('confirmChangeDescriptionToUser', { email: roleChangeInfo?.userName || '' })
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConfirmDialogOpen(false)}>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleChange}>{t('confirmButton')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
