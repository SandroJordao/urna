import type { Candidate, Choices, Office } from '../lib/types'

/**
 * Máquina de estados da cabine de votação.
 *
 *   voting ──(confirma o último cargo)──▶ saving ──(saved)──▶ done ──(reset)──▶ voting
 *                                           │  ▲
 *                                   (failed)▼  │(retry)
 *                                          error
 *
 * Dentro de `voting`, cada cargo é votado em sequência. As transições são
 * síncronas e não dependem de animações: um clique durante uma transição
 * visual é avaliado contra o estado real, nunca contra o que está na tela.
 *
 * `reduce` devolve o mesmo objeto quando o evento é ignorado, o que permite
 * à interface saber se a tecla teve efeito (para tocar o som, por exemplo).
 */

export type Phase = 'voting' | 'saving' | 'done' | 'error'

export interface BoothState {
  readonly phase: Phase
  /** Índice do cargo atual em `offices`. */
  readonly step: number
  readonly digits: string
  readonly blank: boolean
  readonly choices: Choices
  readonly error: string | null
}

export type BoothEvent =
  | { type: 'digit'; digit: string }
  | { type: 'correct' }
  | { type: 'blank' }
  | { type: 'confirm' }
  | { type: 'saved' }
  | { type: 'failed'; message: string }
  | { type: 'retry' }
  | { type: 'reset' }

export type Selection =
  { kind: 'empty' } | { kind: 'partial' } | { kind: 'candidate'; candidate: Candidate } | { kind: 'null' } | { kind: 'blank' }

export interface Ballot {
  offices: readonly Office[]
  candidates: readonly Candidate[]
}

export const initialState = (): BoothState => ({
  phase: 'voting',
  step: 0,
  digits: '',
  blank: false,
  choices: {},
  error: null,
})

export function reduce(ballot: Ballot, state: BoothState, event: BoothEvent): BoothState {
  const office = ballot.offices[state.step]

  switch (event.type) {
    case 'digit': {
      if (state.phase !== 'voting' || !office || state.blank) return state
      if (!/^\d$/.test(event.digit) || state.digits.length >= office.digits) return state
      return { ...state, digits: state.digits + event.digit }
    }

    case 'correct': {
      if (state.phase !== 'voting' || (state.digits === '' && !state.blank)) return state
      return { ...state, digits: '', blank: false }
    }

    case 'blank': {
      // Como na urna real, BRANCO só vale com o visor vazio.
      if (state.phase !== 'voting' || state.blank || state.digits !== '') return state
      return { ...state, blank: true }
    }

    case 'confirm': {
      if (state.phase !== 'voting' || !office) return state
      const complete = state.digits.length === office.digits
      if (!state.blank && !complete) return state

      const choices = { ...state.choices, [office.id]: state.blank ? null : state.digits }
      const last = state.step === ballot.offices.length - 1

      return last ? { ...state, phase: 'saving', choices } : { ...state, step: state.step + 1, digits: '', blank: false, choices }
    }

    case 'saved':
      return state.phase === 'saving' ? { ...state, phase: 'done' } : state

    case 'failed':
      return state.phase === 'saving' ? { ...state, phase: 'error', error: event.message } : state

    case 'retry':
      return state.phase === 'error' ? { ...state, phase: 'saving', error: null } : state

    case 'reset':
      return state.phase === 'done' || state.phase === 'error' ? initialState() : state
  }
}

/** O que o visor deve mostrar para o cargo atual. */
export function selection(ballot: Ballot, state: BoothState): Selection {
  const office = ballot.offices[state.step]
  if (state.blank) return { kind: 'blank' }
  if (!office || state.digits === '') return { kind: 'empty' }
  if (state.digits.length < office.digits) return { kind: 'partial' }

  const candidate = ballot.candidates.find((c) => c.officeId === office.id && c.number === state.digits)
  return candidate ? { kind: 'candidate', candidate } : { kind: 'null' }
}

/** Se CONFIRMA teria efeito agora (usado para destacar o botão). */
export function canConfirm(ballot: Ballot, state: BoothState): boolean {
  return reduce(ballot, state, { type: 'confirm' }) !== state
}
