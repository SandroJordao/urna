/**
 * Anúncios para acessibilidade: sempre atualizam uma região aria-live (para
 * leitores de tela) e, se o "modo áudio" estiver ligado, são falados com a
 * Web Speech API, como o fone de ouvido da urna real.
 */

const STORAGE_KEY = 'urna:speech'
const supported = typeof speechSynthesis !== 'undefined'

let enabled = supported && read()
let region: HTMLElement | null = null

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function voice(): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt'))
}

export const speech = {
  supported,

  get enabled() {
    return enabled
  },

  toggle(): boolean {
    enabled = supported && !enabled
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
    } catch {
      // Preferência só não é lembrada.
    }
    if (!enabled && supported) speechSynthesis.cancel()
    return enabled
  },

  /** Região aria-live que recebe os anúncios. */
  attach(element: HTMLElement): void {
    region = element
  },

  announce(text: string, { interrupt = true } = {}): void {
    if (region) region.textContent = text
    if (!enabled) return

    if (interrupt) speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'pt-BR'
    utterance.rate = 1.05
    const v = voice()
    if (v) utterance.voice = v
    speechSynthesis.speak(utterance)
  },
}
