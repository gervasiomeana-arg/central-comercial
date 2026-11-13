import { useEffect, useRef, useState } from 'react';

// Browser recognition availability varies. Audio is never uploaded to our backend.
export function useVoice(onTranscript: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState('');
  const recognition = useRef<any>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcript = useRef(onTranscript); transcript.current = onTranscript;
  const mounted = useRef(true);
  const Constructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const synthesis = 'speechSynthesis' in window ? window.speechSynthesis : null;
  useEffect(() => {
    mounted.current = true;
    const update = () => {
      const available = window.speechSynthesis?.getVoices() || [];
      setVoices(available.filter(v => /^es\b/i.test(v.lang)).sort((a, b) => Number(b.localService) - Number(a.localService)));
    };
    update(); window.speechSynthesis?.addEventListener('voiceschanged', update);
    return () => {
      mounted.current = false;
      if (timeout.current) clearTimeout(timeout.current);
      recognition.current?.abort(); window.speechSynthesis?.cancel();
      window.speechSynthesis?.removeEventListener('voiceschanged', update);
    };
  }, []);
  const stopSpeaking = () => { synthesis?.cancel(); setSpeaking(false); };
  const stopListening = () => {
    try { recognition.current?.stop(); } catch { /* Already ended. */ }
    if (timeout.current) clearTimeout(timeout.current);
  };
  const dictate = (current: string) => {
    setError('');
    if (listening) { stopListening(); return; }
    if (!Constructor) { setError('Tu navegador no admite dictado. Podés escribir la consulta.'); return; }
    stopSpeaking();
    const instance = new Constructor(); recognition.current = instance;
    instance.lang = 'es-AR'; instance.interimResults = true; instance.continuous = false; instance.maxAlternatives = 1;
    instance.onresult = (event: any) => {
      if (!mounted.current) return;
      let text = ''; for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript + ' ';
      transcript.current((current.trim() + ' ' + text.trim()).trim().slice(0, 1200));
    };
    instance.onerror = (event: any) => {
      if (!mounted.current) return;
      const messages: Record<string, string> = { 'not-allowed': 'No se autorizó el micrófono. Habilitalo en tu navegador o escribí.', 'no-speech': 'No se detectó voz. Podés volver a dictar.', network: 'El servicio de dictado no pudo conectarse. Podés escribir.' };
      setError(messages[event.error] || 'El dictado se detuvo. Revisá el texto antes de enviar.');
    };
    instance.onend = () => {
      if (timeout.current) clearTimeout(timeout.current);
      if (mounted.current) setListening(false);
      recognition.current = null;
    };
    try {
      instance.start(); setListening(true);
      timeout.current = setTimeout(() => instance.stop(), 30000);
    } catch { setListening(false); setError('No se pudo iniciar el dictado. Podés escribir.'); }
  };
  const speak = (text: string) => {
    setError(''); stopListening(); stopSpeaking();
    if (!synthesis) { setError('La lectura en voz alta no está disponible en este navegador.'); return; }
    // Split long reports at sentence boundaries; narration remains user controlled.
    const parts = text.split(/(?<=[.!?])\s+|\n+/).map(p => p.trim()).filter(Boolean);
    const voice = voices.find(v => v.name === voiceName) || voices[0];
    parts.forEach((part, index) => {
      const utterance = new SpeechSynthesisUtterance(part.trim());
      utterance.lang = voice?.lang || 'es-AR'; if (voice) utterance.voice = voice;
      utterance.rate = 0.95;
      utterance.onstart = () => { if (mounted.current) setSpeaking(true); };
      utterance.onend = () => { if (index === parts.length - 1 && mounted.current) setSpeaking(false); };
      utterance.onerror = (event) => { if (mounted.current) { setSpeaking(false); if (event.error !== 'canceled' && event.error !== 'interrupted') setError('La lectura se interrumpió; el informe sigue disponible por escrito.'); } };
      synthesis.speak(utterance);
    });
  };
  return { listening, speaking, error, voices, voiceName, setVoiceName, dictate, speak, stopSpeaking, stopListening,
    canDictate: Boolean(Constructor), canSpeak: Boolean(synthesis) };
}
