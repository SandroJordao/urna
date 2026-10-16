import '../styles/base.css'
import '../styles/booth.css'

import { type Ballot, type BoothEvent, type BoothState, canConfirm, initialState, reduce, selection } from '../booth/machine'
import { ApiError, api } from '../lib/api'
import { avatar, h, param, plural } from '../lib/dom'
import { icon } from '../lib/icons'
import { modal } from '../lib/forms'
import { mount } from '../lib/layout'
import { mascot } from '../lib/mascot'
import { sound } from '../lib/sound'
import { speech } from '../lib/speech'
import type { Election, Office } from '../lib/types'

/** Duração mínima da tela "gravando", para o eleitor perceber a etapa. */
const SAVING_MIN_MS = 1200
/** Tempo na tela FIM antes de liberar a urna para o próximo eleitor. */
const NEXT_VOTER_S = 6

const KEYMAP: Record<string, BoothEvent> = {
  Enter: { type: 'confirm' },
  NumpadEnter: { type: 'confirm' },
  Backspace: { type: 'correct' },
  Delete: { type: 'correct' },
  Escape: { type: 'correct' },
  b: { type: 'blank' },
  B: { type: 'blank' },
}

const soundButton = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Som', 'aria-pressed': String(sound.enabled) })
const speechButton = h('button', {
  class: 'btn btn-ghost btn-icon',
  type: 'button',
  title: 'Modo áudio (lê a tela em voz alta)',
  'aria-pressed': String(speech.enabled),
  hidden: !speech.supported,
})

const main = mount('other', h('div', { class: 'booth-tools' }, soundButton, speechButton))
setupToggles()
void start()

function setupToggles(): void {
  const paint = () => {
    soundButton.replaceChildren(icon(sound.enabled ? 'volume' : 'mute'), h('span', { class: 'sr-only' }, 'Som'))
    soundButton.setAttribute('aria-pressed', String(sound.enabled))
    speechButton.replaceChildren(icon('speech'), h('span', { class: 'sr-only' }, 'Modo áudio'))
    speechButton.setAttribute('aria-pressed', String(speech.enabled))
  }
  soundButton.addEventListener('click', () => {
    sound.toggle()
    paint()
  })
  speechButton.addEventListener('click', () => {
    speech.toggle()
    paint()
    speech.announce(speech.enabled ? 'Modo áudio ligado.' : 'Modo áudio desligado.')
  })
  paint()
}

async function start(): Promise<void> {
  const slug = param('e')
  if (!slug) return unavailable('Nenhuma eleição selecionada.', 'Escolha uma eleição na página inicial.')

  let election: Election
  try {
    election = await api.election(slug)
  } catch (error) {
    return unavailable('Não foi possível abrir a urna.', error instanceof Error ? error.message : '')
  }

  document.title = `Votar · ${election.title}`

  if (election.status === 'draft') {
    return unavailable(election.title, 'A votação ainda não foi aberta.')
  }
  if (election.status === 'closed') {
    return unavailable(
      election.title,
      'A votação foi encerrada.',
      h('a', { class: 'btn btn-primary', href: `./resultados.html?e=${encodeURIComponent(slug)}` }, 'Ver resultados'),
    )
  }

  new Booth(main, election)
}

function unavailable(title: string, message: string, ...actions: Node[]): void {
  main.replaceChildren(
    h(
      'div',
      { class: 'container' },
      h(
        'div',
        { class: 'card empty' },
        h('h2', null, title),
        h('p', null, message),
        h('div', { class: 'row', style: 'justify-content:center' }, ...actions, h('a', { class: 'btn', href: './index.html' }, 'Voltar')),
      ),
    ),
  )
}

class Booth {
  private state: BoothState = initialState()
  private readonly ballot: Ballot
  private readonly steps = h('ol', { class: 'steps', 'aria-label': 'Cargos' })
  private readonly display = h('section', { class: 'display', 'aria-label': 'Visor da urna' })
  private readonly live = h('div', { class: 'sr-only', 'aria-live': 'assertive' })
  private readonly buttons = new Map<string, HTMLButtonElement>()
  private countdown: number | undefined

  constructor(
    root: HTMLElement,
    private readonly election: Election,
  ) {
    this.ballot = { offices: election.offices, candidates: election.candidates }
    speech.attach(this.live)

    root.replaceChildren(
      h(
        'div',
        { class: 'booth' },
        h('div', { class: 'booth-title' }, h('h1', null, election.title), h('span', { class: 'badge badge-open' }, 'Votação aberta')),
        this.steps,
        h('div', { class: 'device' }, mascot('booth-mascot'), this.display, this.keypad()),
        this.shortcuts(),
        this.live,
      ),
    )

    document.addEventListener('keydown', (event) => this.onKey(event))
    this.render(null)
    this.announceOffice()
  }

  private get office(): Office | undefined {
    return this.election.offices[this.state.step]
  }

  // Entrada ------------------------------------------------------------------

  private keypad(): HTMLElement {
    const key = (digit: string) => {
      const button = h(
        'button',
        { class: `key${digit === '0' ? ' key-zero' : ''}`, type: 'button', onClick: () => this.dispatch({ type: 'digit', digit }) },
        digit,
      )
      this.buttons.set(digit, button)
      return button
    }

    const action = (name: 'blank' | 'correct' | 'confirm', label: string, shortcut: string) => {
      const button = h(
        'button',
        { class: `action action-${name}`, type: 'button', onClick: () => this.dispatch({ type: name }) },
        label,
        h('small', { 'aria-hidden': 'true' }, shortcut),
      )
      this.buttons.set(name, button)
      return button
    }

    return h(
      'section',
      { class: 'keypad', 'aria-label': 'Teclado da urna' },
      h('div', { class: 'keypad-brand', 'aria-hidden': 'true' }, 'Urna Online'),
      h('div', { class: 'keys' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(key)),
      h(
        'div',
        { class: 'actions' },
        action('blank', 'BRANCO', 'B'),
        action('correct', 'CORRIGE', '⌫'),
        action('confirm', 'CONFIRMA', 'Enter'),
      ),
    )
  }

  private shortcuts(): HTMLElement {
    const shortcut = (key: string, label: string) => h('span', { class: 'shortcut keyboard-only' }, h('kbd', null, key), label)

    return h(
      'div',
      { class: 'shortcuts' },
      h('span', { class: 'keyboard-only' }, 'Teclado:'),
      shortcut('0–9', 'números'),
      shortcut('B', 'branco'),
      shortcut('Backspace', 'corrige'),
      shortcut('Enter', 'confirma'),
      h(
        'button',
        { class: 'shortcut shortcut-button', type: 'button', onClick: () => this.openCheatSheet() },
        h('kbd', null, 'C'),
        'colinha',
      ),
    )
  }

  private onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    // Com a colinha aberta, o teclado é dela (Esc fecha o modal).
    if (document.querySelector('dialog[open]')) return

    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault()
      this.openCheatSheet()
      return
    }

    const digit = /^\d$/.test(event.key) ? event.key : null
    const action = digit ? ({ type: 'digit', digit } as const) : KEYMAP[event.key]
    if (!action) return

    // Evita que Enter também "clique" o botão em foco.
    event.preventDefault()
    this.flash(digit ?? action.type)
    this.dispatch(action)
  }

  private flash(name: string): void {
    const button = this.buttons.get(name)
    if (!button) return
    button.classList.add('pressed')
    setTimeout(() => button.classList.remove('pressed'), 120)
  }

  private dispatch(event: BoothEvent): void {
    const previous = this.state
    const next = reduce(this.ballot, previous, event)
    if (next === previous) return

    this.state = next
    this.render(previous)
    this.effects(previous, next, event)
  }

  // Efeitos ------------------------------------------------------------------

  private effects(previous: BoothState, next: BoothState, event: BoothEvent): void {
    switch (event.type) {
      case 'digit':
        sound.key()
        this.announceSelection(event.digit)
        break
      case 'blank':
        sound.key()
        this.announceSelection()
        break
      case 'correct':
        sound.correct()
        speech.announce(`Corrigido. Digite o número para ${this.office?.name}.`)
        break
      case 'confirm':
        if (next.phase === 'saving') {
          speech.announce('Gravando voto.')
        } else {
          sound.confirm()
          this.announceOffice()
        }
        break
      case 'saved':
        sound.finish()
        speech.announce('Fim. Seu voto foi registrado.')
        this.startCountdown()
        break
      case 'failed':
        speech.announce(`Erro ao gravar o voto. ${next.error}`)
        break
      case 'reset':
        this.announceOffice()
        break
    }

    if (next.phase === 'saving' && previous.phase !== 'saving') {
      void this.submit(next)
    }
  }

  private async submit(state: BoothState): Promise<void> {
    const started = performance.now()
    try {
      await api.vote(this.election.slug, state.choices)
      const wait = SAVING_MIN_MS - (performance.now() - started)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      this.dispatch({ type: 'saved' })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Falha inesperada.'
      this.dispatch({ type: 'failed', message })
    }
  }

  private startCountdown(): void {
    let remaining = NEXT_VOTER_S
    const label = this.display.querySelector('.countdown')
    const tick = () => {
      if (label) label.textContent = `Próximo eleitor em ${remaining}s`
      if (remaining-- <= 0) this.nextVoter()
    }
    tick()
    this.countdown = window.setInterval(tick, 1000)
  }

  private nextVoter(): void {
    clearInterval(this.countdown)
    this.countdown = undefined
    this.dispatch({ type: 'reset' })
  }

  private announceOffice(): void {
    const office = this.office
    if (office) {
      speech.announce(`Seu voto para ${office.name}. Digite ${plural(office.digits, 'número', 'números')}.`)
    }
  }

  private announceSelection(digit?: string): void {
    const sel = selection(this.ballot, this.state)
    const prefix = digit ? `${digit}. ` : ''
    const confirm = ' Aperte confirma para confirmar, ou corrige para corrigir.'

    switch (sel.kind) {
      case 'candidate': {
        const { name, party, vice } = sel.candidate
        speech.announce(`${prefix}${name}${party ? `, ${party}` : ''}.${vice ? ` Vice: ${vice.name}.` : ''}${confirm}`)
        break
      }
      case 'null':
        speech.announce(`${prefix}Número errado. Voto nulo.${confirm}`)
        break
      case 'blank':
        speech.announce(`Voto em branco.${confirm}`)
        break
      default:
        speech.announce(prefix.trim())
    }
  }

  // Renderização -------------------------------------------------------------

  private render(previous: BoothState | null): void {
    this.renderSteps()
    this.buttons.get('confirm')?.classList.toggle('ready', canConfirm(this.ballot, this.state))

    const { phase } = this.state
    if (previous && previous.phase === phase && phase !== 'voting') return

    const screen =
      phase === 'voting'
        ? this.votingScreen(previous)
        : phase === 'saving'
          ? this.savingScreen()
          : phase === 'done'
            ? this.doneScreen()
            : this.errorScreen()

    this.display.replaceChildren(screen)
  }

  private renderSteps(): void {
    const { step, phase } = this.state
    const finished = phase !== 'voting'

    this.steps.replaceChildren(
      ...this.election.offices.map((office, i) => {
        const done = finished || i < step
        const current = !finished && i === step
        return h(
          'li',
          { class: `step${done ? ' done' : ''}${current ? ' current' : ''}`, 'aria-current': current ? 'step' : null },
          h('span', { class: 'step-index' }, done ? '✓' : i + 1),
          office.name,
        )
      }),
    )
  }

  private votingScreen(previous: BoothState | null): HTMLElement {
    const office = this.office!
    const { digits } = this.state
    const sel = selection(this.ballot, this.state)
    const sameOffice = previous?.phase === 'voting' && previous.step === this.state.step
    const grew = sameOffice && previous.digits.length < digits.length

    const boxes = h(
      'div',
      { class: 'digits', 'aria-label': `Número digitado: ${digits || 'nenhum'}` },
      ...Array.from({ length: office.digits }, (_, i) => {
        const value = digits[i] ?? ''
        const classes = ['digit']
        if (value) classes.push('filled')
        if (grew && i === digits.length - 1) classes.push('pop')
        if (!this.state.blank && i === digits.length) classes.push('current')
        return h('div', { class: classes.join(' '), 'aria-hidden': 'true' }, value)
      }),
    )

    let info: (Node | null)[]
    let photos: Node | null = null

    switch (sel.kind) {
      case 'candidate': {
        const c = sel.candidate
        info = [
          boxes,
          h('div', { class: 'candidate-name' }, c.name),
          c.party ? h('div', { class: 'candidate-party' }, c.party) : null,
          c.vice ? h('div', { class: 'candidate-vice' }, 'Vice: ', h('strong', null, c.vice.name)) : null,
        ]
        photos = h(
          'div',
          { class: 'photos' },
          h('figure', null, avatar(c.name, c.photo, 'avatar photo-main'), h('figcaption', null, office.name)),
          c.vice ? h('figure', null, avatar(c.vice.name, c.vice.photo, 'avatar photo-vice'), h('figcaption', null, 'Vice')) : null,
        )
        break
      }
      case 'null':
        info = [boxes, h('div', { class: 'wrong-number' }, 'NÚMERO ERRADO'), h('div', { class: 'big-message null' }, 'VOTO NULO')]
        break
      case 'blank':
        info = [h('div', { class: 'big-message blank' }, 'VOTO EM BRANCO')]
        break
      default:
        info = [boxes, h('p', { class: 'hint' }, `Digite os ${office.digits} números do seu candidato ou aperte BRANCO.`)]
    }

    const ready = canConfirm(this.ballot, this.state)

    return h(
      'div',
      { class: sameOffice ? 'screen' : 'screen enter' },
      h(
        'div',
        { class: 'display-head' },
        h('div', null, h('div', { class: 'label' }, 'Seu voto para'), h('div', { class: 'office-name' }, office.name)),
        h('div', { class: 'step-counter' }, `${this.state.step + 1} / ${this.election.offices.length}`),
      ),
      h('div', { class: 'display-body' }, h('div', null, ...info), photos),
      h(
        'div',
        { class: 'display-foot', 'aria-hidden': 'true' },
        ready
          ? [
              h('span', null, 'Aperte ', h('b', { class: 'ok' }, 'CONFIRMA'), ' para confirmar'),
              h('span', null, h('b', { class: 'fix' }, 'CORRIGE'), ' para corrigir'),
            ]
          : null,
      ),
    )
  }

  /** "Colinha" em um modal, com os candidatos do cargo atual. Clicar em um digita o número. */
  private openCheatSheet(): void {
    const office = this.office
    if (!office || this.state.phase !== 'voting') return

    const candidates = this.election.candidates.filter((c) => c.officeId === office.id)
    const pick = (number: string) => {
      dialog.close()
      if (this.state.digits !== '' || this.state.blank) this.dispatch({ type: 'correct' })
      for (const digit of number) this.dispatch({ type: 'digit', digit })
    }

    const list =
      candidates.length === 0
        ? h('p', { class: 'muted' }, 'Nenhum candidato cadastrado para este cargo.')
        : h(
            'ul',
            { class: 'cheat-list' },
            ...candidates.map((c) =>
              h(
                'li',
                null,
                h(
                  'button',
                  { class: 'cheat-item', type: 'button', title: `Digitar ${c.number}`, onClick: () => pick(c.number) },
                  h('span', { class: 'cheat-number' }, c.number),
                  avatar(c.name, c.photo, 'avatar cheat-photo'),
                  h('span', { class: 'cheat-name' }, c.name, c.party ? h('small', null, c.party) : null),
                ),
              ),
            ),
          )

    const dialog = modal(
      `Colinha · ${office.name}`,
      h('div', { class: 'dialog-body cheat' }, list),
      h('div', { class: 'dialog-foot cheat-foot' }, 'Clique em um candidato para digitar o número dele.'),
    )
    dialog.classList.add('cheat-dialog')
  }

  private savingScreen(): HTMLElement {
    return h(
      'div',
      { class: 'screen screen-center enter' },
      h('div', { class: 'label' }, 'Gravando'),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Gravando voto' }, h('div')),
    )
  }

  private doneScreen(): HTMLElement {
    return h(
      'div',
      { class: 'screen screen-center screen-fim' },
      h('div', { class: 'fim' }, 'FIM'),
      mascot('fim-mascot'),
      h('p', { class: 'muted' }, 'Seu voto foi registrado. Obrigado!'),
      h('button', { class: 'btn', type: 'button', onClick: () => this.nextVoter() }, 'Próximo eleitor'),
      h('div', { class: 'countdown' }),
    )
  }

  private errorScreen(): HTMLElement {
    return h(
      'div',
      { class: 'screen screen-center enter' },
      h('div', { class: 'big-message null' }, 'Voto não gravado'),
      h('p', { class: 'muted' }, this.state.error ?? ''),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => this.dispatch({ type: 'retry' }) }, 'Tentar novamente'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => this.nextVoter() }, 'Descartar cédula'),
      ),
    )
  }
}
