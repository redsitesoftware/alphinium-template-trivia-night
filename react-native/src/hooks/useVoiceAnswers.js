/**
 * useVoiceAnswers — reusable Web Speech API hook for STT answer input.
 *
 * Works in classic (GameScreen), Chase, and any future mode.
 * Not applicable to Buzzer (player taps buzz button then selects option by touch).
 *
 * Usage:
 *   const { listening, voiceStatus, micBlocked, startListening } = useVoiceAnswers({
 *     question, answered, onMatch: (index) => send({ type: 'submit_answer', answer: index }),
 *   });
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

/** Match spoken text against option strings. Returns 0-3, or -1. */
function matchSpoken(transcript, options) {
  const t = transcript.toLowerCase().trim();

  // 1. Single letter: "a", "b", "c", "d"
  const letterMatch = t.match(/\b([abcd])\b/);
  if (letterMatch && t.replace(/[^a-z]/g, '').length <= 3) return 'abcd'.indexOf(letterMatch[1]);

  // 2. "option a" / "answer b" / "letter c" style
  const prefixMatch = t.match(/(?:option|answer|choose|pick|letter|it'?s?)\s+([abcd])\b/);
  if (prefixMatch) return 'abcd'.indexOf(prefixMatch[1]);

  // 3. Word overlap — option sharing the most content words with the transcript
  const transcriptWords = t.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  let bestIdx = -1, bestScore = 0;
  options.forEach((opt, i) => {
    const optWords = opt.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const matches = transcriptWords.filter(w => optWords.some(ow => ow.includes(w) || w.includes(ow)));
    const score = matches.length;
    const coverage = optWords.length > 0 ? matches.length / optWords.length : 0;
    if (score > bestScore && (score >= 2 || coverage >= 0.5)) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export default function useVoiceAnswers({ question, answered, onMatch }) {
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const recognitionRef = useRef(null);
  const submittedRef = useRef(false);

  // Reset state when question changes or answer submitted
  useEffect(() => {
    setVoiceStatus('');
    setListening(false);
    submittedRef.current = false;
  }, [question?.question]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => {
    if (answered) stopListening();
  }, [answered, stopListening]);

  const startListening = useCallback(async () => {
    if (answered || !question) return;
    if (listening) { stopListening(); return; }

    const SpeechRecognition = Platform.OS === 'web'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      setVoiceStatus('Speech recognition not supported — try Chrome or Edge');
      return;
    }

    submittedRef.current = false;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 5;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      setVoiceStatus('🎤 Listening — say A, B, C, D or speak the answer…');
    };
    recognition.onend = () => { setListening(false); };
    recognition.onerror = (e) => {
      setListening(false);
      if (e.error === 'no-speech')       setVoiceStatus('No speech detected — try again');
      else if (e.error === 'not-allowed') {
        setMicBlocked(true);
        setVoiceStatus('🔒 Mic blocked — go back to lobby and allow microphone access');
      }
      else if (e.error === 'aborted')    setVoiceStatus('');
      else                               setVoiceStatus(`Mic error: ${e.error} — try again`);
    };

    recognition.onresult = (event) => {
      if (submittedRef.current) return;

      const allTranscripts = [];
      for (let r = 0; r < event.results.length; r++) {
        for (let a = 0; a < event.results[r].length; a++) {
          allTranscripts.push(event.results[r][a].transcript);
        }
      }

      const bestTranscript = allTranscripts[0] || '';
      setVoiceStatus(`"${bestTranscript}"`);

      let matched = -1;
      for (const alt of allTranscripts) {
        matched = matchSpoken(alt, question.options);
        if (matched !== -1) break;
      }

      if (matched !== -1) {
        submittedRef.current = true;
        setVoiceStatus(`✅ ${OPTION_LABELS[matched]}: ${question.options[matched]}`);
        onMatch(matched);
      } else {
        setVoiceStatus(`❓ Heard "${bestTranscript}" — try saying just A, B, C or D`);
      }
    };

    try { recognition.start(); }
    catch (e) { setVoiceStatus(`Could not start mic: ${e.message}`); }
  }, [answered, question, listening, stopListening, onMatch]);

  return { listening, voiceStatus, micBlocked, startListening };
}
