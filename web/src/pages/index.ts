import '../styles/base.css'

import { api } from '../lib/api'
import { h, statusBadge } from '../lib/dom'
import { mount } from '../lib/layout'
import { mascot } from '../lib/mascot'
import type { ElectionSummary } from '../lib/types'

const main = mount('home')
const grid = h('div', { class: 'election-grid', 'aria-busy': 'true' }, ...[1, 2, 3].map(() => h('div', { class: 'card skeleton' })))

main.append(
  h(
    'div',
    { class: 'container' },
    h(
      'section',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-text' },
        h('span', { class: 'eyebrow' }, 'Urna Online'),
        h('h1', null, 'Vote, apure e ', h('span', { class: 'gradient-text' }, 'confira'), '!'),
        h(
          'p',
          null,
          'Cadastre eleições com vários cargos e candidatos com foto, vote pelo mouse, toque ou teclado e acompanhe uma apuração com verificação de integridade.',
        ),
        h(
          'div',
          { class: 'features' },
          ...['Vários cargos por eleição', 'Teclado físico', 'Modo áudio', 'Boletim de urna', 'Sem banco de dados'].map((f) =>
            h('span', { class: 'feature' }, f),
          ),
        ),
      ),
      mascot('hero-mascot'),
    ),
    h('div', { class: 'section-title' }, h('h2', null, 'Eleições')),
    grid,
  ),
)

void load()

async function load(): Promise<void> {
  try {
    const elections = await api.elections()
    grid.removeAttribute('aria-busy')

    if (elections.length === 0) {
      grid.replaceWith(
        h(
          'div',
          { class: 'card empty' },
          h('h2', null, 'Nenhuma eleição cadastrada'),
          h('p', null, 'Crie a primeira na área de administração.'),
          h('a', { class: 'btn btn-primary', href: './admin.html' }, 'Ir para administração'),
        ),
      )
      return
    }

    grid.replaceChildren(...elections.map(card))
  } catch (error) {
    grid.replaceWith(
      h(
        'div',
        { class: 'card empty' },
        h('h2', null, 'Não foi possível carregar as eleições'),
        h('p', null, error instanceof Error ? error.message : ''),
      ),
    )
  }
}

function card(e: ElectionSummary, index: number): HTMLElement {
  const slug = encodeURIComponent(e.slug)
  const action =
    e.status === 'open'
      ? h('a', { class: 'btn btn-primary', href: `./votar.html?e=${slug}` }, 'Votar agora')
      : e.status === 'closed'
        ? h('a', { class: 'btn btn-primary', href: `./resultados.html?e=${slug}` }, 'Ver resultados')
        : h('span', { class: 'muted' }, 'Em preparação')

  return h(
    'article',
    { class: 'card election-card', style: `animation-delay: ${index * 70}ms` },
    h('div', { class: 'row' }, statusBadge(e.status)),
    h('h3', null, e.title),
    e.description ? h('p', null, e.description) : null,
    h('div', { class: 'chips' }, ...e.offices.map((office) => h('span', { class: 'chip' }, office))),
    h(
      'div',
      { class: 'stats' },
      h('div', null, h('strong', null, e.candidates), e.candidates === 1 ? 'candidato' : 'candidatos'),
      h('div', null, h('strong', null, e.ballots), e.ballots === 1 ? 'voto' : 'votos'),
    ),
    h('div', { class: 'row card-actions' }, action),
  )
}
