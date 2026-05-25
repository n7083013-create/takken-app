// ============================================================
// 音声認識フック（マルチプラットフォーム対応）
// - Web: ブラウザ標準の Web Speech API（無料・全ユーザー対応）
// - Native (iOS/Android): expo-av + OpenAI Whisper API（Premium 限定）
//
// 顧客満足度方針:
// - 利用できないユーザーには `isAvailable: false` を返してマイクボタン自体を非表示にする
// - 押した後にエラーが出る UX は避ける（不信感の源）
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { API_BASE_URL } from '../constants/config';

interface UseSpeechRecognitionReturn {
  /** 音声認識中かどうか */
  isListening: boolean;
  /** 認識されたテキスト（最終結果のみ。Native は録音終了後に一括反映） */
  transcript: string;
  /** 音声認識を開始 */
  startListening: () => void;
  /** 音声認識を停止（Native は文字起こし中の状態に遷移） */
  stopListening: () => void;
  /** 音声認識が利用可能か（マイクボタンの表示判定に使う） */
  isAvailable: boolean;
  /** エラーメッセージ（致命的エラーのみ） */
  error: string | null;
}

const MAX_RECORDING_MS = 30 * 1000;  // 30秒上限（コスト・UX 両面）

/**
 * Web Speech API or Whisper を使った音声認識フック
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ---- Web Speech API 用 ref ----
  const recognitionRef = useRef<any>(null);

  // ---- Native (expo-av) 用 ref ----
  const recordingRef = useRef<any>(null);
  const audioModuleRef = useRef<any>(null);
  const autoStopTimerRef = useRef<any>(null);

  // Native は Premium ユーザーかつログイン中のみ利用可能
  const session = useAuthStore((s) => s.session);
  const isPro = useSettingsStore((s) => s.isPro());

  // ---- isAvailable 判定 ----
  let isAvailable = false;
  if (Platform.OS === 'web') {
    isAvailable =
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  } else {
    // Native: ログイン済 + Premium のみ
    isAvailable = !!session?.access_token && isPro;
  }

  // ---- クリーンアップ ----
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (recordingRef.current) {
        try {
          recordingRef.current.stopAndUnloadAsync();
        } catch {}
      }
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
      }
    };
  }, []);

  // ============================================================
  // Web Speech API (Chrome/Safari/Edge)
  // ============================================================
  const startListeningWeb = useCallback(() => {
    if (!isAvailable) return;
    setError(null);
    setTranscript('');

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interimTranscript += result[0].transcript;
        }
        setTranscript(finalTranscript || interimTranscript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError('マイクのアクセスが許可されていません。ブラウザの設定を確認してください。');
        } else if (event.error === 'no-speech') {
          // ユーザーへの不信感を避けるため何も表示しない（再度押せばOK）
        } else {
          setError('音声認識に失敗しました。もう一度お試しください。');
        }
      };

      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setError('音声認識を開始できませんでした');
      setIsListening(false);
    }
  }, [isAvailable]);

  const stopListeningWeb = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  }, []);

  // ============================================================
  // Native: expo-av Recording → Whisper API
  // ============================================================
  const startListeningNative = useCallback(async () => {
    if (!isAvailable) return;
    setError(null);
    setTranscript('');

    try {
      // expo-av を動的 import (Web ビルドで参照エラーになるのを回避)
      const Audio = audioModuleRef.current || (await import('expo-av')).Audio;
      audioModuleRef.current = Audio;

      // マイク許可
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError('マイクの許可が必要です');
        return;
      }

      // 録音モード設定
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // 録音開始（16kHz mono、コスト最小化）
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 32000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.LOW,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 32000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
      });

      await recording.startAsync();
      recordingRef.current = recording;
      setIsListening(true);

      // 30秒で自動停止（コスト・UX 防御）
      autoStopTimerRef.current = setTimeout(() => {
        stopListeningNative();
      }, MAX_RECORDING_MS);
    } catch (e) {
      setIsListening(false);
      setError('録音を開始できませんでした');
    }
  }, [isAvailable]);

  const stopListeningNative = useCallback(async () => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    const recording = recordingRef.current;
    if (!recording) {
      setIsListening(false);
      return;
    }

    try {
      // 録音停止 + ファイル取得
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsListening(false);
        return;
      }

      // Audio mode を元に戻す
      try {
        const Audio = audioModuleRef.current || (await import('expo-av')).Audio;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
      } catch {}

      // ファイルを fetch して base64 化（JSON 経由で送るため）
      const fileResponse = await fetch(uri);
      const audioBlob = await fileResponse.blob();

      // Blob → base64 変換
      const base64Audio: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === 'string') resolve(result);
          else reject(new Error('FileReader returned non-string'));
        };
        reader.onerror = () => reject(reader.error || new Error('FileReader error'));
        reader.readAsDataURL(audioBlob);
      });

      // Whisper API（バックエンド経由）に送信
      const token = session?.access_token;
      if (!token) {
        setIsListening(false);
        setError('ログインが必要です');
        return;
      }

      const apiResponse = await fetch(`${API_BASE_URL}/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'voice',
          audio: base64Audio,
          mimeType: audioBlob.type || 'audio/m4a',
        }),
      });

      const data = await apiResponse.json().catch(() => ({}));

      if (!apiResponse.ok) {
        // エラーメッセージは API 側で日本語化済（"premium_required" などは表示しない方針）
        if (data?.code === 'premium_required') {
          // この時点で発生するのは isAvailable 判定漏れ。サイレントに無視
        } else if (apiResponse.status === 429) {
          setError(data.error || '本日の音声入力上限に達しました');
        } else {
          setError('音声認識に失敗しました');
        }
        setIsListening(false);
        return;
      }

      const text = (data.transcript || '').trim();
      if (text) {
        setTranscript(text);
      }
      // 認識できなかった場合（warning 付き）は無音扱いでサイレント
      setIsListening(false);
    } catch (e) {
      setIsListening(false);
      setError('音声認識に失敗しました');
    }
  }, [session?.access_token]);

  // ============================================================
  // Public API
  // ============================================================
  const startListening = useCallback(() => {
    if (Platform.OS === 'web') startListeningWeb();
    else startListeningNative();
  }, [startListeningWeb, startListeningNative]);

  const stopListening = useCallback(() => {
    if (Platform.OS === 'web') stopListeningWeb();
    else stopListeningNative();
  }, [stopListeningWeb, stopListeningNative]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isAvailable,
    error,
  };
}
