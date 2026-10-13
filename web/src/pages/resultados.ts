import '../styles/base.css'
import '../styles/results.css'

import { ApiError, api } from '../lib/api'
import { avatar, formatDate, formatNumber, h, param, percent, plural, statusBadge, toast } from '../lib/dom'
import { icon } from '../lib/icons'
import { mount } from '../lib/layout'
import type { OfficeResult, Results } from '../lib/types'

const main = mount('other')
const container = h('div', { class: 'container' }, h('div', { class: 'card skeleton' }))
main.append(container)

const slug = param('e')
void load()

async function load(): Promise<void> {
  if (!slug) return message('Nenhuma eleição selecionada.', '')

  try {
    render(await api.results(slug))
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return message('Resultados ainda não disponíveis', error.message)
    }
    message('Não foi possível carregar os resultados', error instanceof Error ? error.message : '')
  }
}

function message(title: string, text: string): void {
  container.replaceChildren(
    h('div', { class: 'card empty' }, h('h2', null, title), h('p', null, text), h('a', { class: 'btn', href: './index.html' }, 'Voltar')),
  )
}

function render(results: Results): void {
  const { election } = results
  document.title = `Resultados · ${election.title}`

  const blank = results.offices.reduce((sum, o) => sum + o.blank, 0)
  const nulls = results.offices.reduce((sum, o) => sum + o.null, 0)

  container.replaceChildren(
    h(
      'section',
      { class: 'results-head' },
      h(
        'div',
        { class: 'row' },
        statusBadge(election.status),
        h('span', { class: 'eyebrow' }, results.final ? 'Boletim de urna' : 'Apuração parcial'),
      ),
      h('h1', null, election.title),
      h(
        'p',
        { class: 'muted', style: 'margin:0' },
        `Abertura: ${formatDate(election.openedAt)} · Encerramento: ${formatDate(election.closedAt)} · Emitido em ${formatDate(results.generatedAt)}`,
      ),
      results.final
        ? null
        : h('div', { class: 'partial-banner' }, 'Resultado parcial, visível apenas para administradores enquanto a votação está aberta.'),
      h(
        'div',
        { class: 'row no-print' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => print() }, icon('print'), 'Imprimir boletim'),
        results.final ? null : h('button', { class: 'btn', type: 'button', onClick: () => void load() }, icon('refresh'), 'Atualizar'),
        h('a', { class: 'btn btn-ghost', href: './index.html' }, 'Voltar'),
      ),
    ),
    h(
      'div',
      { class: 'totals' },
      total(results.ballots, 'eleitores votaram'),
      total(election.offices.length, election.offices.length === 1 ? 'cargo' : 'cargos'),
      total(blank, 'votos em branco'),
      total(nulls, 'votos nulos'),
    ),
    ...results.offices.map((office) => officeSection(office, results.final)),
    integrity(results),
  )
}

const total = (value: number, label: string) =>
  h('div', { class: 'card total' }, h('strong', null, formatNumber(value)), h('span', null, label))

function officeSection(result: OfficeResult, final: boolean): HTMLElement {
  const { office, candidates, valid, total } = result
  const top = candidates[0]?.votes ?? 0
  const tied = candidates.filter((c) => c.votes === top).length > 1

  const rows = candidates.map((c, i) => {
    const leader = top > 0 && !tied && i === 0
    return h(
      'li',
      { class: `result-row${leader ? ' leader' : ''}` },
      h('span', { class: 'rank' }, `${i + 1}º`),
      avatar(c.name, c.photo),
      h(
        'div',
        null,
        h(
          'div',
          { class: 'result-name' },
          `${c.number} · ${c.name}`,
          leader ? h('span', { class: 'tag-leader' }, final ? 'Mais votado' : 'Liderando') : null,
        ),
        h('div', { class: 'result-meta' }, [c.party, c.vice ? `Vice: ${c.vice.name}` : ''].filter(Boolean).join(' · ')),
        bar(c.votes, valid),
      ),
      votes(c.votes, valid),
    )
  })

  const other = (label: string, value: number) =>
    h(
      'li',
      { class: 'result-row result-other' },
      h('span', { class: 'rank' }, '—'),
      h('div', null, h('div', { class: 'result-name' }, label), bar(value, total, true)),
      votes(value, total),
    )

  return h(
    'section',
    { class: 'card office-result', 'aria-labelledby': `office-${office.id}` },
    h(
      'header',
      null,
      h('h2', { id: `office-${office.id}` }, office.name),
      h('span', { class: 'muted' }, `${plural(valid, 'voto válido', 'votos válidos')} de ${formatNumber(total)}`),
    ),
    h('ol', { class: 'result-list' }, ...rows, other('Brancos', result.blank), other('Nulos', result.null)),
    tied && top > 0 ? h('p', { class: 'muted' }, 'Há empate na primeira colocação.') : null,
  )
}

function bar(value: number, total: number, muted = false): HTMLElement {
  const width = total === 0 ? 0 : (value / total) * 100
  return h('div', { class: `bar${muted ? ' muted-bar' : ''}`, 'aria-hidden': 'true' }, h('div', { style: `--w: ${width}%` }))
}

function votes(value: number, total: number): HTMLElement {
  return h('div', { class: 'result-votes' }, h('strong', null, formatNumber(value)), h('span', null, percent(value, total)))
}

function integrity(results: Results): HTMLElement {
  const { consistent, hash } = results.integrity

  return h(
    'section',
    { class: `card integrity ${consistent ? 'ok' : 'fail'}` },
    h('h2', null, icon('shield', 22), consistent ? 'Apuração íntegra' : 'Inconsistência detectada'),
    h(
      'p',
      null,
      consistent
        ? 'Os totais foram recontados a partir do Registro Digital do Voto (as cédulas, guardadas em ordem aleatória e sem identificação) e conferem com a apuração.'
        : 'A recontagem do Registro Digital do Voto não confere com os totais: o arquivo da eleição foi alterado fora da aplicação.',
    ),
    h(
      'div',
      { class: 'hash' },
      h('code', null, hash),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm no-print',
          type: 'button',
          title: 'Copiar hash',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(hash)
              toast('Hash copiado.')
            } catch {
              toast('Não foi possível copiar.', 'error')
            }
          },
        },
        icon('copy', 16),
        h('span', { class: 'sr-only' }, 'Copiar hash'),
      ),
    ),
    h('p', null, 'SHA-256 dos totais deste boletim. Qualquer alteração nos votos produz um hash diferente.'),
  )
}
