/**
 * Efeitos sonoros sintetizados com Web Audio (nenhum arquivo de áudio).
 */

const STORAGE_KEY = 'urna:sound'

let context: AudioContext | null = null
let enabled = read()

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

function tone(frequency: number, start: number, duration: number, volume = 0.05): void {
  const ctx = audio()
  if (!ctx) return

  const at = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'square'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)

  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + duration + 0.02)
}

export const sound = {
  get enabled() {
    return enabled
  },

  toggle(): boolean {
    enabled = !enabled
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
    } catch {
      // Preferência só não é lembrada.
    }
    return enabled
  },

  key: () => tone(1180, 0, 0.05, 0.03),
  correct: () => tone(620, 0, 0.09, 0.04),
  confirm: () => tone(1400, 0, 0.14),

  /** O "pi-pi-pi-piii" de fim de votação. */
  finish(): void {
    ;[0, 0.11, 0.22, 0.33].forEach((start) => tone(1900, start, 0.07))
    tone(1900, 0.44, 0.55)
  },
}
