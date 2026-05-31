/**
 * LobbyScreen — Waiting room.
 * Shows room code, player list, and host controls (start, timer, spectator toggle).
 */

import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Switch, TextInput,
  ScrollView, Share, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useGame } from '../context/GameContext';
import { AuthContext } from '../context/AuthContext';
import { stripeService } from '../services/stripe';
import ttsPlayer, { unlockAudioFromGesture } from '../services/ttsPlayer';
import { colors, typography, spacing, radius, shadows } from '../theme';
import { ConnectionState } from '../services/websocket';
import { getJoinUrl, getWebBaseUrl } from '../config';
import AppFooter from '../components/AppFooter';
import { AppLogo } from '../components/common/AppLogo';
import CreditsScreen from './CreditsScreen';
import ShareSheet from '../components/ShareSheet';

function getDeviceUserId() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  let id = localStorage.getItem('trivia_device_user_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('trivia_device_user_id', id);
  }
  return id;
}

const SETTINGS_KEY = 'trivia_host_settings';

function loadSettings() {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSettings(patch) {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    const existing = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...patch }));
  } catch {}
}

const PRESET_SUBJECTS = [
  { label: '🌐 General', value: 'General Knowledge' },
  { label: '🏎️ Motorsports', value: 'Motorsports and Formula 1 racing' },
  { label: '🎬 Movies', value: 'Movies and Cinema' },
  { label: '🎵 Music', value: 'Music and Pop Culture' },
  { label: '🌍 Geography', value: 'World Geography' },
  { label: '⚽ Sports', value: 'Sport and Athletics' },
  { label: '🔬 Science', value: 'Science and Technology' },
  { label: '📜 History', value: 'World History' },
  { label: '🍕 Food & Drink', value: 'Food and Drink' },
  { label: '📺 TV Shows', value: 'Television Shows and Series' },
  { label: '🎮 Gaming', value: 'Video Games' },
  { label: '🦁 Nature', value: 'Animals and Nature' },
  { label: '🚀 Space', value: 'Space and Astronomy' },
];

const DIFFICULTIES = [
  { label: 'Easy', value: 'easy', emoji: '😊', desc: 'Fun for everyone' },
  { label: 'Medium', value: 'medium', emoji: '🧠', desc: 'A real challenge' },
  { label: 'Hard', value: 'hard', emoji: '🔥', desc: 'Experts only' },
];

const GAME_MODES = [
  { label: 'Classic', value: 'classic', emoji: '🎯', desc: 'Rounds & leaderboard' },
  { label: 'Millionaire', value: 'millionaire', emoji: '💰', desc: 'Lifelines & ladder' },
  { label: 'Buzzer', value: 'buzzer', emoji: '🔔', desc: 'Fastest finger first' },
  { label: 'Chase', value: 'chase', emoji: '🏃', desc: 'Beat the Chaser' },
];

export default function LobbyScreen() {
  const navigation = useNavigation();
  const { state, send, disconnect, startGame, clearInsufficientCredits, setGameMode } = useGame();
  const { roomCode, players, isHost, spectatorModeEnabled, spectatorCount, connectionState, error, insufficientCredits, gameMode } = state;
  const { user } = useContext(AuthContext) || {};
  const userId = user?.id ? String(user.id) : getDeviceUserId();
  const userFullName = user
    ? `${user.firstname || ''}${user.lastname ? ' ' + user.lastname : ''}`.trim() || user.username || null
    : null;

  // Admin detection: client-side check — server validates too
  const ADMIN_NAMES = ['Dan Woods']; // mirror ADMIN_USER_NAMES env var
  const isAdminLocally = userFullName && ADMIN_NAMES.some(n => n.toLowerCase() === userFullName.toLowerCase());

  // Load persisted settings once on mount
  const saved = loadSettings();

  const [timerDuration, setTimerDuration]         = useState(saved.timerDuration     ?? '30');
  const [aiMode, setAiMode]                       = useState(saved.aiMode            ?? false);
  const [subject, setSubject]                     = useState(saved.subject           ?? '');
  const [difficulty, setDifficulty]               = useState(saved.difficulty        ?? 'medium');
  const [isPublic, setIsPublic]                   = useState(saved.isPublic          ?? false);
  const [voiceEnabled, setVoiceEnabled]           = useState(true);
  const [banterEnabled, setBanterEnabled]         = useState(true);
  const [voiceAnswers, setVoiceAnswers]           = useState(true); // on by default
  const [mutePlayersOnStart, setMutePlayersOnStart] = useState(saved.mutePlayersOnStart ?? false);
  const [testMode, setTestMode]                   = useState(false); // admin only — never persisted
  const [numRounds, setNumRounds]                 = useState(saved.numRounds         ?? 1);
  const [questionsPerRound, setQuestionsPerRound] = useState(saved.questionsPerRound ?? 4);
  const [voices, setVoices]                       = useState([]);
  const [selectedVoiceId, setSelectedVoiceId]     = useState(saved.selectedVoiceId  ?? null);
  const [lobbyError, setLobbyError]               = useState('');
  const [soloConfirm, setSoloConfirm]             = useState(false);
  const [shareCopied, setShareCopied]             = useState(false);
  const [showCredits, setShowCredits]             = useState(false);
  const [creditBalance, setCreditBalance]         = useState(null);
  // iOS web audio unlock state — show tap-to-enable banner until user explicitly taps it
  const [audioEnabled, setAudioEnabled]           = useState(Platform.OS !== 'web');
  // Mic permission for voice answers: 'unknown' | 'checking' | 'prompt' | 'granted' | 'denied'
  const [micPermission, setMicPermission]         = useState('unknown');

  // voiceAnswers: host uses local state (toggled), players read from game context (must be after useState)
  const effectiveVoiceAnswers = isHost ? voiceAnswers : (state.voiceAnswers === true);

  // Check microphone permission state whenever voiceAnswers is on (web only)
  useEffect(() => {
    if (!effectiveVoiceAnswers || Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      setMicPermission('prompt'); // assume we need to ask
      return;
    }
    navigator.permissions.query({ name: 'microphone' })
      .then(result => {
        setMicPermission(result.state);
        result.onchange = () => setMicPermission(result.state);
      })
      .catch(() => setMicPermission('prompt'));
  }, [effectiveVoiceAnswers]);

  // Fetch credit balance on load and when returning from CreditsScreen
  useEffect(() => {
    if (!userId) return;
    stripeService.getCreditBalance(userId)
      .then(bal => {
        const balance = bal?.balance ?? 0;
        setCreditBalance(balance);
        // Default aiMode ON for paid/admin users if they've never explicitly saved it
        if (!Object.prototype.hasOwnProperty.call(saved, 'aiMode') && (isAdminLocally || balance > 0)) {
          setAiMode(true);
        }
      })
      .catch(() => {
        // Admin still gets aiMode default even if credit fetch fails
        if (!Object.prototype.hasOwnProperty.call(saved, 'aiMode') && isAdminLocally) {
          setAiMode(true);
        }
      });
  }, [userId, showCredits]);

  // Auto-save settings whenever they change
  useEffect(() => {
    if (!isHost) return;
    saveSettings({ timerDuration, aiMode, subject, difficulty, isPublic, mutePlayersOnStart, numRounds, questionsPerRound, selectedVoiceId });
  }, [timerDuration, aiMode, subject, difficulty, isPublic, mutePlayersOnStart, numRounds, questionsPerRound, selectedVoiceId, isHost]);

  // Fetch available host voices (only if host — guests don't need this)
  useEffect(() => {
    if (!isHost) return;
    const base = getWebBaseUrl();
    if (!base) return;
    fetch(`${base}/api/tts/voices`)
      .then(r => r.json())
      .then(({ voices: v }) => {
        setVoices(v || []);
        // Use saved voiceId if valid, else fall back to server default
        const def = (v || []).find(x => x.isDefault);
        const savedValid = selectedVoiceId && (v || []).some(x => x.id === selectedVoiceId);
        if (!savedValid && def) {
          setSelectedVoiceId(def.id);
        } else if (savedValid) {
          // Tell server to use the saved voice
          send({ type: 'set_host_voice', voiceId: selectedVoiceId });
        }
      })
      .catch(() => {});
  }, [isHost]);

  function handleVoiceSelect(voiceId) {
    setSelectedVoiceId(voiceId);
    send({ type: 'set_host_voice', voiceId });
    
    // Play an engaging preview with the user's name
    if (Platform.OS === 'web' && voiceId) {
      const firstName = userFullName?.split(' ')[0] || 'friend';
      const greetings = [
        `Hey ${firstName}! Ready to host an amazing trivia night?`,
        `Hello ${firstName}! Let's make this game unforgettable.`,
        `Welcome ${firstName}! I'll be your trivia host tonight.`,
        `Hi ${firstName}! Time to test your players' knowledge.`,
      ];
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      console.log('[LobbyScreen] Playing voice preview:', greeting);
      ttsPlayer.playStatic(greeting, false, voiceId, true); // dynamic=true
    }
  }

  // Open credits modal when server says insufficient credits
  useEffect(() => {
    if (insufficientCredits) {
      setShowCredits(true);
      clearInsufficientCredits?.();
    }
  }, [insufficientCredits]);

  const isReconnecting = connectionState === ConnectionState.RECONNECTING;

  function handlePublicToggle(val) {
    setIsPublic(val);
    send({ type: 'set_public', isPublic: val });
  }

  function handleVoiceToggle(val) {
    setVoiceEnabled(val);
    send({ type: 'set_voice', voiceEnabled: val });
    if (!val) ttsPlayer.stop(); // stop any currently playing audio
  }
  
  function handleBanterToggle(val) {
    setBanterEnabled(val);
    send({ type: 'set_banter', banterEnabled: val });
  }

  function handleVoiceAnswersToggle(val) {
    setVoiceAnswers(val);
    send({ type: 'set_voice_answers', voiceAnswers: val });
  }

  async function requestMicPermission() {
    setMicPermission('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(t => t.stop());
      setMicPermission('granted');
    } catch (err) {
      setMicPermission(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' ? 'denied' : 'prompt');
    }
  }

  function handleStart() {
    if (players.length < 1) { setLobbyError('Wait for at least 1 player to join.'); return; }
    if (players.length === 1) { setSoloConfirm(true); return; }
    setLobbyError('');
    startGame(aiMode, subject.trim() || null, difficulty, userId, mutePlayersOnStart, userFullName, testMode, numRounds, questionsPerRound);
  }

  function handleSetTimer() {
    const d = parseInt(timerDuration, 10);
    if (isNaN(d) || d < 10 || d > 120) {
      setLobbyError('Timer must be between 10 and 120 seconds.');
      return;
    }
    setLobbyError('');
    send({ type: 'set_timer', duration: d });
  }

  function handleSpectatorToggle(val) {
    send({ type: 'toggle_spectator_mode', enabled: val });
  }

  function handleLeave() {
    disconnect();
  }

  async function handleShare() {
    const joinUrl = getJoinUrl(roomCode);
    const message = joinUrl
      ? `Join my Trivia Night game! Room code: ${roomCode}\n${joinUrl}`
      : `Join my Trivia Night game! Room code: ${roomCode}`;

    if (Platform.OS === 'web') {
      if (joinUrl && navigator?.clipboard) {
        try {
          await navigator.clipboard.writeText(joinUrl);
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2500);
          return;
        } catch {}
      }
      if (joinUrl && navigator?.share) {
        navigator.share({ title: 'Join Trivia Night', text: message, url: joinUrl }).catch(() => {});
        return;
      }
      // Fallback: show the URL inline
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 4000);
      return;
    }
    try {
      await Share.share({ message });
    } catch {}
  }


  return (
    <>
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Reconnect banner */}
      {isReconnecting && (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectText}>⚡ Reconnecting…</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {/* Logo header */}
        <AppLogo size="sm" showTitle style={styles.logoHeader} />

        {/* Room code + Join Link */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <Text style={styles.codeText}>{roomCode}</Text>
          <ShareSheet
            title="Join Trivia Night"
            text={`Join my Trivia Night game! Room code: ${roomCode}`}
            url={getJoinUrl(roomCode)}
            label="Invite Friends 🔗"
            style={styles.shareSheetLobby}
          />
        </View>

        {/* Player list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Players ({players.length})
          </Text>
          <View style={styles.playerList}>
            {players.map((item) => (
              <View key={item.id} style={styles.playerItem}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.playerName}>
                  {item.name}
                  {item.id === state.playerId ? (
                    <Text style={styles.youTag}> (you)</Text>
                  ) : null}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 🎙️ Mic permission banner — shown to all users when voice answers is on */}
        {effectiveVoiceAnswers && Platform.OS === 'web' && micPermission !== 'granted' && (
          <TouchableOpacity
            style={[
              styles.micBanner,
              micPermission === 'denied' && styles.micBannerDenied,
              micPermission === 'checking' && styles.micBannerChecking,
            ]}
            onPress={micPermission !== 'denied' ? requestMicPermission : undefined}
            activeOpacity={micPermission !== 'denied' ? 0.75 : 1}
          >
            <Text style={styles.micBannerIcon}>
              {micPermission === 'granted'  ? '✅' :
               micPermission === 'denied'   ? '🔒' :
               micPermission === 'checking' ? '⏳' : '🎙️'}
            </Text>
            <View style={styles.micBannerText}>
              {micPermission === 'denied' ? (
                <>
                  <Text style={styles.micBannerTitle}>Microphone blocked</Text>
                  <Text style={styles.micBannerHint}>
                    Click the 🔒 lock icon in your browser address bar → Microphone → Allow → reload
                  </Text>
                </>
              ) : micPermission === 'checking' ? (
                <Text style={styles.micBannerTitle}>Requesting microphone…</Text>
              ) : (
                <>
                  <Text style={styles.micBannerTitle}>🎙️ Allow microphone for voice answers</Text>
                  <Text style={styles.micBannerHint}>Tap to enable — say A, B, C, D or speak the answer during play</Text>
                </>
              )}
            </View>
            {micPermission !== 'denied' && micPermission !== 'checking' && (
              <View style={styles.micBannerBtn}>
                <Text style={styles.micBannerBtnText}>Allow</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Mic granted confirmation — briefly shown */}
        {effectiveVoiceAnswers && Platform.OS === 'web' && micPermission === 'granted' && (
          <View style={styles.micBannerGranted}>
            <Text style={styles.micBannerGrantedText}>✅ Microphone ready — voice answers enabled</Text>
          </View>
        )}

        {/* Host controls */}
        {isHost ? (
          <View style={styles.hostControls}>
            {/* Subject */}
            <Text style={styles.sectionTitle}>🎯 Subject</Text>
            <TextInput
              style={styles.subjectInput}
              placeholder="e.g. Ford Motorsports, 90s Hip Hop, The Roman Empire…"
              placeholderTextColor={colors.textMuted}
              value={subject}
              onChangeText={setSubject}
              maxLength={80}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContainer}
            >
              {PRESET_SUBJECTS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.chip, subject === p.value && styles.chipSelected]}
                  onPress={() => setSubject(subject === p.value ? '' : p.value)}
                >
                  <Text style={[styles.chipText, subject === p.value && styles.chipTextSelected]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Difficulty */}
            <Text style={styles.sectionTitle}>⚡ Difficulty</Text>
            <View style={styles.difficultyRow}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.diffBtn, difficulty === d.value && styles.diffBtnSelected]}
                  onPress={() => setDifficulty(d.value)}
                >
                  <Text style={styles.diffEmoji}>{d.emoji}</Text>
                  <Text style={[styles.diffLabel, difficulty === d.value && styles.diffLabelSelected]}>
                    {d.label}
                  </Text>
                  <Text style={styles.diffDesc}>{d.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Game Mode */}
            <Text style={styles.sectionTitle}>🎮 Game Mode</Text>
            <View style={styles.modeGrid}>
              {GAME_MODES.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.modeCard, gameMode === m.value && styles.modeCardSelected]}
                  onPress={() => setGameMode(m.value)}
                >
                  <Text style={styles.modeEmoji}>{m.emoji}</Text>
                  <Text style={[styles.modeLabel, gameMode === m.value && styles.modeLabelSelected]}>{m.label}</Text>
                  <Text style={styles.modeDesc}>{m.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Options row */}
            <View style={styles.optionsBlock}>
              {/* Quiz Master commentary */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setAiMode((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>🎙️ Quiz Master Commentary</Text>
                  <Text style={styles.optionHint}>
                    {aiMode ? 'Live roasts, hints & banter' : 'Questions only — no commentary'}
                  </Text>
                </View>
                <Switch
                  value={aiMode}
                  onValueChange={setAiMode}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.white}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Voice (ElevenLabs TTS) */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => handleVoiceToggle(!voiceEnabled)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>🔊 Voice Questions</Text>
                  <Text style={styles.optionHint}>
                    {voiceEnabled ? 'Quiz Master reads questions aloud' : 'Silent — text only'}
                  </Text>
                </View>
                <Switch
                  value={voiceEnabled}
                  onValueChange={handleVoiceToggle}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.white}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* AI Banter Toggle — show only when voice is enabled */}
              {voiceEnabled && (
                <TouchableOpacity
                  style={[styles.optionRow, { marginTop: spacing.md }]}
                  onPress={() => handleBanterToggle(!banterEnabled)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.controlLabel}>🎭 Live AI Banter</Text>
                    <Text style={styles.optionHint}>
                      {banterEnabled ? 'Host reacts to answers' : 'Silent scoring'}
                    </Text>
                  </View>
                  <Switch
                    value={banterEnabled}
                    onValueChange={handleBanterToggle}
                    trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                    thumbColor={colors.white}
                    pointerEvents="none"
                  />
                </TouchableOpacity>
              )}

              {/* Host Voice Picker — shown when voice is enabled and voices loaded */}
              {voiceEnabled && voices.length > 0 && (
                <View style={styles.voicePickerContainer}>
                  <Text style={styles.voicePickerLabel}>🎙️ Host Voice</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceScroll}>
                    {voices.map(v => {
                      const active = selectedVoiceId === v.id;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.voiceChip, active && styles.voiceChipActive]}
                          onPress={() => handleVoiceSelect(v.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.voiceChipEmoji]}>{v.label.split(' ')[0]}</Text>
                          <Text style={[styles.voiceChipName, active && styles.voiceChipNameActive]}>{v.name}</Text>
                          <Text style={[styles.voiceChipAccent, active && styles.voiceChipAccentActive]}>{v.accent}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {selectedVoiceId && (
                    <Text style={styles.voicePickerHint}>
                      {voices.find(v => v.id === selectedVoiceId)?.desc ?? ''}
                    </Text>
                  )}
                </View>
              )}

              {/* Mute Players on Start */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setMutePlayersOnStart((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>🔇 Mute All Players on Start</Text>
                  <Text style={styles.optionHint}>
                    {mutePlayersOnStart
                      ? 'Playing in the same room? Host audio only — players hear through your speaker'
                      : 'Each player hears the Quiz Master on their own device'}
                  </Text>
                </View>
                <Switch
                  value={mutePlayersOnStart}
                  onValueChange={setMutePlayersOnStart}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.white}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Voice Answer Input */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => handleVoiceAnswersToggle(!voiceAnswers)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>🎙️ Voice Answer Input</Text>
                  <Text style={styles.optionHint}>
                    {voiceAnswers
                      ? 'Players can say a letter (A–D) or speak the answer aloud'
                      : 'Players tap answer buttons only'}
                  </Text>
                </View>
                <Switch
                  value={voiceAnswers}
                  onValueChange={handleVoiceAnswersToggle}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.white}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Buy AI game credits — shows balance */}
              <TouchableOpacity
                style={styles.creditsRow}
                onPress={() => setShowCredits(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.creditsRowText}>🎮 Buy AI Game Credits</Text>
                <Text style={[styles.creditsRowArrow, creditBalance === 0 && styles.creditsRowEmpty]}>
                  {creditBalance === null ? '→' : creditBalance === 0 ? '0 left' : `${creditBalance} left`}
                </Text>
              </TouchableOpacity>

              {/* Public room toggle */}
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => handlePublicToggle(!isPublic)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlLabel}>🌐 Public Room</Text>
                  <Text style={styles.optionHint}>
                    {isPublic ? 'Listed on the home page — anyone can join' : 'Invite only — share the room code'}
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={handlePublicToggle}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.white}
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Timer */}
              <View style={styles.timerRow}>
                <Text style={styles.controlLabel}>⏱ Timer (sec)</Text>
                <TextInput
                  style={styles.timerInput}
                  value={timerDuration}
                  onChangeText={setTimerDuration}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TouchableOpacity style={styles.setBtn} onPress={handleSetTimer}>
                  <Text style={styles.setBtnText}>Set</Text>
                </TouchableOpacity>
              </View>

              {/* Rounds configuration */}
              <View style={styles.roundsSection}>
                <Text style={styles.controlLabel}>🔄 Rounds</Text>
                <View style={styles.chipRow}>
                  {[1, 2, 3, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.chip, numRounds === n && styles.chipActive]}
                      onPress={() => setNumRounds(n)}
                    >
                      <Text style={[styles.chipText, numRounds === n && styles.chipTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.controlLabel}>❓ Questions per Round</Text>
                <View style={styles.chipRow}>
                  {[3, 4, 5, 6].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.chip, questionsPerRound === n && styles.chipActive]}
                      onPress={() => setQuestionsPerRound(n)}
                    >
                      <Text style={[styles.chipText, questionsPerRound === n && styles.chipTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.roundsSummary}>
                  {numRounds} round{numRounds > 1 ? 's' : ''} · {questionsPerRound} questions each · {numRounds * questionsPerRound} total
                </Text>
              </View>

              {/* Spectators */}
              <View style={styles.optionRow}>
                <Text style={styles.controlLabel}>
                  👁 Spectators: {spectatorCount}
                </Text>
                <Switch
                  value={spectatorModeEnabled}
                  onValueChange={handleSpectatorToggle}
                  trackColor={{ false: colors.surfaceBorder, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            {/* Admin badge + test mode toggle (only visible to admin users) */}
            {isAdminLocally && (
              <>
                <TouchableOpacity
                  style={[styles.optionRow, styles.adminRow]}
                  onPress={() => setTestMode(v => !v)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.controlLabel}>🛡️ Admin Mode <Text style={styles.adminBadge}>ADMIN</Text></Text>
                    <Text style={styles.optionHint}>
                      {testMode ? '🧪 Testing as free user — credits enforced' : 'Credits bypassed. Tap to test as free user.'}
                    </Text>
                  </View>
                  <Switch
                    value={!testMode}
                    onValueChange={v => setTestMode(!v)}
                    trackColor={{ false: colors.surfaceBorder, true: '#e67e22' }}
                    thumbColor={colors.white}
                    pointerEvents="none"
                  />
                </TouchableOpacity>
                
                {/* Question Cache Screen */}
                <TouchableOpacity
                  style={[styles.optionRow, styles.adminRow]}
                  onPress={() => navigation.navigate('QuestionCache')}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.controlLabel}>📚 Question Cache</Text>
                    <Text style={styles.optionHint}>
                      View stats, browse questions &amp; clear cache
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted }}>›</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.optionRow, styles.adminRow, { justifyContent: 'center' }]}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
                      localStorage.removeItem(SETTINGS_KEY);
                      window.location.reload();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: '#e67e22', fontWeight: '700', fontSize: typography.sm }}>
                    🔄 Reset All Settings to Default
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Error / retry card */}
            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorCardIcon}>
                  {error.includes('cancel') ? '🚫' : '⚠️'}
                </Text>
                <Text style={styles.errorCardTitle}>
                  {error.includes('cancel') ? 'Game start cancelled' : 'Could not generate questions'}
                </Text>
                <Text style={styles.errorCardMsg}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleStart} activeOpacity={0.8}>
                  <Text style={styles.retryBtnText}>🔄 Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.waitingMsg}>
            <Text style={styles.waitingText}>⏳ Waiting for host to start the game…</Text>
            {!audioEnabled && (
              <TouchableOpacity
                style={styles.audioEnableBtn}
                onPress={() => {
                  unlockAudioFromGesture();
                  setAudioEnabled(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.audioEnableBtnText}>🔊 Tap to enable audio</Text>
                <Text style={styles.audioEnableBtnSub}>Required on iPhone/iPad for voice</Text>
              </TouchableOpacity>
            )}
            {audioEnabled && Platform.OS === 'web' && (
              <Text style={styles.audioEnabledText}>🔊 Audio enabled</Text>
            )}
          </View>
        )}

        {/* Leave */}
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Leave Room</Text>
        </TouchableOpacity>

        <AppFooter />
      </ScrollView>

      {/* Sticky Start Game bar — always visible at bottom for host */}
      {isHost && !error && (
        <View style={styles.stickyBar}>
          {soloConfirm ? (
            <View style={styles.soloConfirm}>
              <Text style={styles.soloConfirmText}>🤔 You're the only player. Start anyway?</Text>
              <View style={styles.soloConfirmBtns}>
                <TouchableOpacity
                  style={styles.soloCancel}
                  onPress={() => setSoloConfirm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.soloCancelText}>Wait for Players</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="solo-start-anyway"
                  style={styles.soloStart}
                  onPress={() => { setSoloConfirm(false); startGame(aiMode, subject.trim() || null, difficulty, userId, mutePlayersOnStart, userFullName, testMode, numRounds, questionsPerRound); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.soloStartText}>Start Anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {lobbyError ? (
                <View style={styles.stickyError}>
                  <Text style={styles.stickyErrorText}>⚠️ {lobbyError}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.startBtn, players.length < 1 && styles.startBtnDisabled]}
                onPress={handleStart}
                disabled={players.length < 1}
                activeOpacity={0.8}
              >
                <Text style={styles.startBtnText}>
                  {aiMode ? '🎙️ Start with Quiz Master' : '🚀 Start Game'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </SafeAreaView>

    {/* Credits purchase modal */}
    <Modal
      visible={showCredits}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowCredits(false)}
    >
      <CreditsScreen onClose={() => setShowCredits(false)} />
    </Modal>
    
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    // Web: constrain to viewport so ScrollView can scroll internally
    ...Platform.select({ web: { height: '100vh', overflow: 'hidden' } }),
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    // On web: cap scroll container so content actually scrolls instead of page expanding
    ...Platform.select({ web: { maxHeight: '100vh' } }),
  },

  reconnectBanner: {
    backgroundColor: colors.warning,
    padding: spacing.sm,
    alignItems: 'center',
  },
  reconnectText: { color: colors.black, fontWeight: typography.bold, fontSize: typography.sm },

  container: {
    padding: spacing.lg,
    // Extra bottom padding so content clears the fixed sticky bar
    paddingBottom: (spacing.xxl ?? spacing.xl * 2) + 80,
  },

  logoHeader: {
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
  },

  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'stretch',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  codeLabel: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  codeText: {
    fontSize: typography.xxxl,
    fontWeight: typography.heavy,
    color: colors.primary,
    letterSpacing: 8,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  shareSheetLobby: { marginTop: spacing.xs },

  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  playerList: { backgroundColor: colors.surface, borderRadius: radius.lg },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: colors.white, fontWeight: typography.bold, fontSize: typography.base },
  playerName: { fontSize: typography.base, color: colors.textPrimary, flex: 1 },
  youTag: { color: colors.textMuted, fontSize: typography.sm },

  hostControls: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  controlLabel: { fontSize: typography.base, color: colors.textPrimary, flex: 1 },

  subjectInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    color: colors.textPrimary,
    fontSize: typography.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },

  // Preset chips
  chipsScroll: { marginBottom: spacing.md },
  chipsContainer: { paddingVertical: spacing.xs, gap: spacing.xs, flexDirection: 'row' },
  chip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full ?? 99,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginRight: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary,
  },
  chipText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: typography.medium },
  chipTextSelected: { color: colors.primary, fontWeight: typography.bold },

  // Difficulty
  difficultyRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  diffBtn: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  diffBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  diffEmoji: { fontSize: 22, marginBottom: 2 },
  diffLabel: {
    fontSize: typography.sm,
    fontWeight: typography.bold,
    color: colors.textSecondary,
  },
  diffLabelSelected: { color: colors.primary },
  diffDesc: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  // Game Mode grid
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  modeCard: {
    width: '47%',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  modeEmoji: { fontSize: 24, marginBottom: 2 },
  modeLabel: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textSecondary },
  modeLabelSelected: { color: colors.primary },
  modeDesc: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  // Options block (toggles + timer grouped together)
  optionsBlock: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  optionHint: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  creditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  creditsRowText: {
    fontSize: typography.base,
    color: '#a78bfa',
    fontWeight: '600',
  },
  creditsRowArrow: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a78bfa',
  },
  creditsRowEmpty: {
    color: colors.error,
  },

  timerRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  timerInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    color: colors.textPrimary,
    fontSize: typography.base,
    padding: spacing.sm,
    width: 60,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  setBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  setBtnText: { color: colors.textPrimary, fontWeight: typography.medium },

  errorBanner: {
    backgroundColor: '#3d1a1a',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: { color: '#ff6b6b', fontSize: typography.sm, textAlign: 'center' },

  errorCard: {
    backgroundColor: '#2a1515',
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff6b6b44',
  },
  errorCardIcon: { fontSize: 36, marginBottom: spacing.sm },
  errorCardTitle: {
    fontSize: typography.base,
    fontWeight: typography.bold,
    color: '#ff6b6b',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  errorCardMsg: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  retryBtnText: { color: colors.white, fontWeight: typography.bold, fontSize: typography.sm },

  startBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: colors.white, fontSize: typography.md, fontWeight: typography.bold },

  stickyBar: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    // On web: position fixed so it's always visible regardless of scroll layout
    ...Platform.select({
      web: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 },
    }),
  },
  stickyError: {
    backgroundColor: '#3d1a1a',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  stickyErrorText: { color: '#ff6b6b', fontSize: typography.sm, textAlign: 'center' },

  soloConfirm: {
    gap: spacing.sm,
  },
  soloConfirmText: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    textAlign: 'center',
    fontWeight: typography.medium,
    marginBottom: spacing.xs,
  },
  soloConfirmBtns: { flexDirection: 'row', gap: spacing.sm },
  soloCancel: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  soloCancelText: { color: colors.textSecondary, fontWeight: typography.medium },
  soloStart: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  soloStartText: { color: colors.white, fontWeight: typography.bold },

  waitingMsg: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  waitingText: { color: colors.textSecondary, fontSize: typography.base },
  audioEnableBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  audioEnableBtnText: { color: colors.white, fontSize: typography.md, fontWeight: typography.bold },
  audioEnableBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: typography.xs, marginTop: 2 },
  audioEnabledText: { color: colors.accent, fontSize: typography.sm, fontWeight: typography.semibold },

  leaveBtn: { alignItems: 'center', padding: spacing.md },
  leaveBtnText: { color: colors.textMuted, fontSize: typography.sm },

  adminRow: {
    borderTopWidth: 1,
    borderTopColor: '#e67e2230',
    backgroundColor: '#e67e2210',
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  adminBadge: {
    fontSize: 9,
    fontWeight: typography.bold,
    color: '#e67e22',
    backgroundColor: '#e67e2220',
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },

  voicePickerContainer: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  voicePickerLabel: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
    marginBottom: spacing.xs,
  },
  voiceScroll: { flexGrow: 0 },
  voiceChip: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    minWidth: 70,
  },
  voiceChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#6C63FF22',
  },
  voiceChipEmoji: { fontSize: 18 },
  voiceChipName: { color: colors.text, fontSize: typography.xs, fontWeight: typography.semibold, marginTop: 2 },
  voiceChipNameActive: { color: colors.primary },
  voiceChipAccent: { color: colors.textMuted, fontSize: 9, marginTop: 1 },
  voiceChipAccentActive: { color: colors.primary },
  voicePickerHint: {
    color: colors.textMuted,
    fontSize: typography.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Rounds configuration
  roundsSection: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#6C63FF22',
  },
  chipText: {
    color: colors.text,
    fontSize: typography.base,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
  },
  roundsSummary: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },

  // Mic permission banner
  micBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.12)',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  micBannerDenied: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderColor: '#e74c3c',
  },
  micBannerChecking: {
    opacity: 0.7,
  },
  micBannerIcon: { fontSize: 24 },
  micBannerText: { flex: 1 },
  micBannerTitle: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: typography.bold,
    marginBottom: 2,
  },
  micBannerHint: {
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 16,
  },
  micBannerBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  micBannerBtnText: {
    color: colors.white,
    fontSize: typography.sm,
    fontWeight: typography.bold,
  },
  micBannerGranted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(39, 174, 96, 0.1)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#27ae60',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  micBannerGrantedText: {
    color: '#27ae60',
    fontSize: typography.xs,
    fontWeight: typography.semibold,
  },
});

