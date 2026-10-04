import { useCallback } from 'react';
import type { DialogButton } from '@/components/AppDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { requestAccountDeletion } from '@/services/paymentService';
import { runAccountDeletionFlow } from '@/services/accountDeletionFlow';

type ShowDialog = (title: string, message: string, buttons?: DialogButton[]) => void;

export function useAccountDeletion(showDialog: ShowDialog) {
  const { logout } = useAuth();
  const { t } = useLanguage();

  return useCallback(() => {
    showDialog(t('delete_account'), t('delete_account_warning'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'danger',
        onPress: () => showDialog(t('delete_account_confirm'), t('delete_account_confirm_message'), [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('delete_account'),
            style: 'danger',
            onPress: () => {
              void (async () => {
                try {
                  await runAccountDeletionFlow({
                    requestDeletion: requestAccountDeletion,
                    logoutAndClear: () => logout({ clearLocalStorage: true }),
                  });
                } catch {
                  showDialog(t('error_title'), t('delete_account_failed'), [{ text: t('ok'), style: 'default' }]);
                }
              })();
            },
          },
        ]),
      },
    ]);
  }, [logout, showDialog, t]);
}
