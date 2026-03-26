import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Send, Lock } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToMessages, subscribeToRequest, fetchUserById, sendMessage } from '@/services/firestoreService';
import { EquipmentRequest, User } from '@/types';
import { ChatMessage } from '@/types';

export default function ChatScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { isRTL, t, localizedText } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const currentUid = user?.uid || '';

  const isChatActive = request && ['accepted', 'in_progress'].includes(request.status);

  const otherUserName = useMemo(() => {
    return otherUser ? localizedText(otherUser.nameAr, otherUser.nameEn) : '';
  }, [otherUser, localizedText]);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!requestId) return;
    const unsub = subscribeToRequest(requestId, async (req) => {
      setRequest(req);
      if (req) {
        const otherUid = req.customerUid === currentUid ? req.providerUid : req.customerUid;
        const u = await fetchUserById(otherUid);
        setOtherUser(u);
      }
    });
    return () => unsub();
  }, [requestId, currentUid]);

  useEffect(() => {
    if (!requestId) return;
    const unsub = subscribeToMessages(requestId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    return () => unsub();
  }, [requestId]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !requestId) return;
    const text = message.trim();
    setMessage('');
    try {
      await sendMessage(requestId, currentUid, text);
    } catch (e) {
      console.log('[Chat] Send error:', e);
      setMessage(text);
    }
  }, [message, requestId, currentUid]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isMe = item.senderUid === currentUid;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.otherMessage]}>
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>{item.text}</Text>
        <Text style={[styles.messageTime, isMe ? styles.myTimeText : styles.otherTimeText]}>
          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }, [currentUid]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.card }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start', flex: 1 }}>
            <Text style={styles.headerName}>{otherUserName}</Text>
            <Text style={styles.headerStatus}>{isChatActive ? t('chat') : t('chat_closed')}</Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        <SafeAreaView edges={['bottom']} style={{ backgroundColor: Colors.card }}>
          {isChatActive ? (
            <View style={[styles.inputBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TextInput
                style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                placeholder={t('type_message')}
                placeholderTextColor={Colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <Pressable
                style={[styles.sendButton, !message.trim() && styles.sendDisabled]}
                onPress={handleSend}
                disabled={!message.trim()}
              >
                <Send size={20} color={message.trim() ? Colors.primary : Colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.closedBar}>
              <Lock size={16} color={Colors.textMuted} />
              <Text style={styles.closedText}>{t('chat_closed')}</Text>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  headerName: { fontSize: 17, fontWeight: '700' as const, color: Colors.textPrimary },
  headerStatus: { fontSize: 12, color: Colors.textMuted },
  messagesList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 8,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.gold,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: { fontSize: 15, lineHeight: 21 },
  myMessageText: { color: Colors.primary },
  otherMessageText: { color: Colors.textPrimary },
  messageTime: { fontSize: 10, marginTop: 4 },
  myTimeText: { color: 'rgba(11, 26, 47, 0.5)', textAlign: 'right' as const },
  otherTimeText: { color: Colors.textMuted, textAlign: 'right' as const },
  inputBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendDisabled: { backgroundColor: Colors.surface },
  closedBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  closedText: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' as const },
});
