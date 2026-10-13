import { h } from './dom'

type Page = 'home' | 'admin' | 'other'

export function header(active: Page, ...extra: Node[]): HTMLElement {
  const link = (href: string, label: string, page: Page) =>
    h('a', { class: 'nav-link', href, 'aria-current': active === page ? 'page' : null }, label)

  return h(
    'header',
    { class: 'app-header' },
    h(
      'a',
      { class: 'logo', href: './index.html', 'aria-label': 'Urna, página inicial' },
      h('span', { class: 'logo-mark', 'aria-hidden': 'true' }, 'U2'),
      h('span', { class: 'logo-text' }, 'Urna'),
    ),
    h('nav', { 'aria-label': 'Principal' }, ...extra, link('./index.html', 'Eleições', 'home'), link('./admin.html', 'Admin', 'admin')),
  )
}

export function footer(): HTMLElement {
  return h(
    'footer',
    { class: 'site-footer' },
    'Projeto de portfólio · TypeScript + PHP, sem banco de dados · Não é um sistema oficial de votação.',
  )
}

/** Monta a estrutura padrão de página e devolve o <main>. */
export function mount(active: Page, ...extra: Node[]): HTMLElement {
  const main = h('main', { id: 'main' })
  document.body.replaceChildren(header(active, ...extra), main, footer())
  return main
}
