import { describe, expect, it } from 'vitest'
import { type Ballot, type BoothEvent, type BoothState, canConfirm, initialState, reduce, selection } from '../web/src/booth/machine'

const ballot: Ballot = {
  offices: [
    { id: 'deputado', name: 'Deputado', digits: 4, hasVice: false },
    { id: 'presidente', name: 'Presidente', digits: 2, hasVice: true },
  ],
  candidates: [
    { id: 'a', officeId: 'deputado', number: '1234', name: 'Ana', party: 'P1', photo: null, vice: null },
    { id: 'b', officeId: 'presidente', number: '13', name: 'Beto', party: 'P2', photo: null, vice: { name: 'Caio', photo: null } },
  ],
}

const run = (...events: BoothEvent[]): BoothState => events.reduce((state, event) => reduce(ballot, state, event), initialState())

const digits = (value: string): BoothEvent[] => [...value].map((digit) => ({ type: 'digit', digit }))
const confirm: BoothEvent = { type: 'confirm' }
const blank: BoothEvent = { type: 'blank' }
const correct: BoothEvent = { type: 'correct' }

describe('digitação', () => {
  it('aceita no máximo a quantidade de dígitos do cargo', () => {
    expect(run(...digits('123456')).digits).toBe('1234')
  })

  it('ignora o que não é dígito', () => {
    const state = initialState()
    expect(reduce(ballot, state, { type: 'digit', digit: 'a' })).toBe(state)
  })

  it('identifica candidato, número parcial e voto nulo', () => {
    expect(selection(ballot, run(...digits('12'))).kind).toBe('partial')
    expect(selection(ballot, run(...digits('1234')))).toMatchObject({ kind: 'candidate', candidate: { name: 'Ana' } })
    expect(selection(ballot, run(...digits('9999'))).kind).toBe('null')
  })

  it('CORRIGE limpa os dígitos e o voto em branco', () => {
    expect(run(...digits('12'), correct).digits).toBe('')
    expect(run(blank, correct).blank).toBe(false)
  })
})

describe('voto em branco', () => {
  it('só é aceito com o visor vazio', () => {
    expect(run(...digits('1'), blank).blank).toBe(false)
    expect(run(blank).blank).toBe(true)
  })

  it('bloqueia a digitação enquanto ativo', () => {
    expect(run(blank, ...digits('12')).digits).toBe('')
  })
})

describe('confirmação', () => {
  it('não confirma número incompleto', () => {
    const state = run(...digits('12'))
    expect(canConfirm(ballot, state)).toBe(false)
    expect(reduce(ballot, state, confirm)).toBe(state)
  })

  it('avança para o próximo cargo e zera o visor', () => {
    const state = run(...digits('1234'), confirm)
    expect(state).toMatchObject({ step: 1, digits: '', phase: 'voting', choices: { deputado: '1234' } })
  })

  it('registra branco como null e nulo como o número digitado', () => {
    const state = run(blank, confirm, ...digits('99'), confirm)
    expect(state.phase).toBe('saving')
    expect(state.choices).toEqual({ deputado: null, presidente: '99' })
  })

  it('ignora teclas enquanto grava (evita voto duplo)', () => {
    const saving = run(...digits('1234'), confirm, ...digits('13'), confirm)
    expect(saving.phase).toBe('saving')
    for (const event of [confirm, blank, correct, ...digits('1')]) {
      expect(reduce(ballot, saving, event)).toBe(saving)
    }
  })
})

describe('gravação', () => {
  const saving = run(...digits('1234'), confirm, ...digits('13'), confirm)

  it('vai para "done" e depois reinicia para o próximo eleitor', () => {
    const done = reduce(ballot, saving, { type: 'saved' })
    expect(done.phase).toBe('done')
    expect(reduce(ballot, done, { type: 'reset' })).toEqual(initialState())
  })

  it('em caso de erro permite tentar de novo com a mesma cédula', () => {
    const failed = reduce(ballot, saving, { type: 'failed', message: 'offline' })
    expect(failed).toMatchObject({ phase: 'error', error: 'offline' })

    const retry = reduce(ballot, failed, { type: 'retry' })
    expect(retry).toMatchObject({ phase: 'saving', choices: saving.choices, error: null })
  })

  it('não reinicia no meio da votação', () => {
    const voting = run(...digits('12'))
    expect(reduce(ballot, voting, { type: 'reset' })).toBe(voting)
  })
})
