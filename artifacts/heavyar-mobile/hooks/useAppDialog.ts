import { useState, useCallback } from 'react';
import { DialogButton } from '@/components/AppDialog';

interface DialogState {
  visible: boolean;
  title: string;
  message: string;
  buttons: DialogButton[];
}

const initialState: DialogState = {
  visible: false,
  title: '',
  message: '',
  buttons: [],
};

export function useAppDialog() {
  const [dialog, setDialog] = useState<DialogState>(initialState);

  const showDialog = useCallback((
    title: string,
    message: string,
    buttons: DialogButton[] = [{ text: 'OK', style: 'default' }]
  ) => {
    setDialog({ visible: true, title, message, buttons });
  }, []);

  const hideDialog = useCallback(() => {
    setDialog(initialState);
  }, []);

  return { dialog, showDialog, hideDialog };
}
