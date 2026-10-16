import { assetUrl } from './api'
import type { ElectionStatus } from './types'

type Child = Node | string | number | null | undefined | false | Child[]
type Attrs = Record<string, unknown>

/** Atributos aplicados como propriedade do elemento, não como atributo HTML. */
const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate'])

/**
 * Cria elementos sem innerHTML: todo texto vira nó de texto, então dados
 * vindos da API nunca são interpretados como HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue

    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    } else if (key === 'class') {
      el.className = String(value)
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value)
    } else if (PROPS.has(key)) {
      ;(el as unknown as Record<string, unknown>)[key] = value
    } else {
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }

  el.append(...flatten(children))
  return el
}

function flatten(children: Child[]): (Node | string)[] {
  return children.flatMap((child): (Node | string)[] => {
    if (Array.isArray(child)) return flatten(child)
    if (child === null || child === undefined || child === false) return []
    return [typeof child === 'number' ? String(child) : child]
  })
}

export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`Elemento não encontrado: ${selector}`)
  return el
}

export const param = (name: string): string | null => new URLSearchParams(location.search).get(name)

/** Foto do candidato, ou um avatar com as iniciais quando não há foto. */
export function avatar(name: string, photo: string | null, className = 'avatar'): HTMLElement {
  if (photo) {
    return h('img', { class: className, src: assetUrl(photo), alt: `Foto de ${name}`, loading: 'lazy', decoding: 'async' })
  }

  // Primeiro e último nome, ignorando "de", "da", "dos", artigos ("o", "the") e algarismos romanos.
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word && !/^(d[aeo]s?|e|[oa]s?|the|of|[ivx]+)$/i.test(word))
  const initials =
    [words[0], words.length > 1 ? words.at(-1) : undefined]
      .map((word) => word?.[0] ?? '')
      .join('')
      .toUpperCase() || name.trim().charAt(0).toUpperCase()

  return h('div', { class: `${className} avatar-initials`, role: 'img', 'aria-label': name, style: `--hue: ${hue(name)}` }, initials)
}

function hue(text: string): number {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

export const STATUS_LABEL: Record<ElectionStatus, string> = {
  draft: 'Rascunho',
  open: 'Votação aberta',
  closed: 'Encerrada',
}

export const statusBadge = (status: ElectionStatus): HTMLElement => h('span', { class: `badge badge-${status}` }, STATUS_LABEL[status])

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
export const formatDate = (iso: string | null): string => (iso ? dateFormat.format(new Date(iso)) : '—')

export const formatNumber = (n: number): string => n.toLocaleString('pt-BR')

export const percent = (part: number, total: number): string =>
  total === 0 ? '0%' : `${((part / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

/** Aviso temporário no canto da tela. */
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  let region = document.querySelector<HTMLElement>('.toasts')
  if (!region) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
    document.body.append(region)
  }

  const item = h('div', { class: `toast toast-${kind}` }, message)
  region.append(item)
  setTimeout(() => {
    item.classList.add('toast-out')
    item.addEventListener('animationend', () => item.remove())
  }, 3500)
}

export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}
