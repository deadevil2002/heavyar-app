import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { X, CheckCircle, Circle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { RequestMode } from '@/types';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export type RentalRequestDraft = {
  requestMode: RequestMode;
  numberOfDays?: number;
  notes?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (draft: RentalRequestDraft) => Promise<void> | void;
};

export default function RentalRequestModal({ visible, onClose, onSubmit }: Props) {
  const { isRTL, t } = useLanguage();
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const [requestMode, setRequestMode] = useState<RequestMode>('fixed_duration');
  const [daysText, setDaysText] = useState<string>('1');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const isFixed = requestMode === 'fixed_duration';

  const parsedDays = useMemo(() => {
    const n = parseInt(daysText.trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }, [daysText]);

  const validate = useCallback((): { ok: true; draft: RentalRequestDraft } | { ok: false } => {
    if (isFixed) {
      if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 365) {
        showDialog(t('validation_error'), t('validation_days_required'), [{ text: t('ok'), style: 'default' }]);
        return { ok: false };
      }
      return {
        ok: true,
        draft: {
          requestMode,
          numberOfDays: parsedDays,
          notes: notes.trim() ? notes.trim() : undefined,
        },
      };
    }

    return {
      ok: true,
      draft: {
        requestMode,
        notes: notes.trim() ? notes.trim() : undefined,
      },
    };
  }, [isFixed, notes, parsedDays, requestMode, showDialog, t]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const result = validate();
    if (!result.ok) return;

    try {
      setSubmitting(true);
      await onSubmit(result.draft);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [onClose, onSubmit, submitting, validate]);

  const RadioIcon = isRTL ? CheckCircle : CheckCircle;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('request_rental')}</Text>
              <Pressable style={styles.closeBtn} onPress={onClose} disabled={submitting}>
                <X size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('request_mode')}</Text>

              <Pressable
                style={[styles.optionCard, requestMode === 'fixed_duration' && styles.optionCardActive]}
                onPress={() => setRequestMode('fixed_duration')}
                disabled={submitting}
              >
                <View style={[styles.optionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.radio}>
                    {requestMode === 'fixed_duration' ? (
                      <RadioIcon size={18} color={Colors.gold} />
                    ) : (
                      <Circle size={18} color={Colors.textMuted} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('fixed_duration')}</Text>
                    <Text style={[styles.optionSub, { textAlign: isRTL ? 'right' : 'left' }]}>{t('fixed_duration_desc')}</Text>
                  </View>
                </View>
              </Pressable>

              <Pressable
                style={[styles.optionCard, requestMode === 'open_ended' && styles.optionCardActive]}
                onPress={() => setRequestMode('open_ended')}
                disabled={submitting}
              >
                <View style={[styles.optionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.radio}>
                    {requestMode === 'open_ended' ? (
                      <RadioIcon size={18} color={Colors.gold} />
                    ) : (
                      <Circle size={18} color={Colors.textMuted} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('until_work_completion')}</Text>
                    <Text style={[styles.optionSub, { textAlign: isRTL ? 'right' : 'left' }]}>{t('until_work_completion_desc')}</Text>
                  </View>
                </View>
              </Pressable>

              {isFixed && (
                <View style={styles.field}>
                  <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('number_of_days')}</Text>
                  <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <TextInput
                      style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                      value={daysText}
                      onChangeText={setDaysText}
                      keyboardType="number-pad"
                      placeholder={t('number_of_days_placeholder')}
                      placeholderTextColor={Colors.textMuted}
                      editable={!submitting}
                      maxLength={3}
                    />
                  </View>
                </View>
              )}

              <View style={styles.field}>
                <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('notes_optional')}</Text>
                <TextInput
                  style={[styles.notesInput, { textAlign: isRTL ? 'right' : 'left' }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t('notes_placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  editable={!submitting}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={[styles.footerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={[styles.footerBtn, styles.cancelBtn]} onPress={onClose} disabled={submitting}>
                <Text style={styles.cancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.footerBtn, styles.submitBtn, submitting && styles.submitDisabled]} onPress={handleSubmit} disabled={submitting}>
                <Text style={styles.submitText}>{t('submit_request')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <AppDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  title: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  optionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionCardActive: {
    borderColor: Colors.gold,
  },
  optionRow: {
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  optionSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  field: {
    gap: 8,
  },
  inputRow: {
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    padding: 0,
  },
  notesInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 15,
    minHeight: 96,
    textAlignVertical: 'top' as const,
  },
  footerRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtn: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  submitBtn: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '800' as const,
  },
});
