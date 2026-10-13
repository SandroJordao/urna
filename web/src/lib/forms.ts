import { ApiError } from './api'
import { h } from './dom'
import { icon } from './icons'

/** Campo rotulado. `name` liga o campo aos erros por campo da API. */
export function field(label: string, name: string, control: HTMLElement): HTMLLabelElement {
  const error = h('small', { class: 'field-error', hidden: true })
  const wrapper = h('label', { class: 'field', dataset: { field: name } }, h('span', null, label), control, error)

  // O erro some assim que a pessoa começa a corrigir o campo.
  control.addEventListener('input', () => {
    wrapper.classList.remove('invalid')
    error.hidden = true
  })

  return wrapper
}

export function input(attrs: Record<string, unknown>): HTMLInputElement {
  return h('input', { class: 'input', ...attrs })
}

export function clearErrors(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.field.invalid').forEach((f) => f.classList.remove('invalid'))
  root.querySelectorAll<HTMLElement>('.field-error').forEach((e) => {
    e.hidden = true
    e.textContent = ''
  })
  root.querySelector('.form-error')?.remove()
}

/**
 * Mostra os erros de uma ApiError nos campos correspondentes; o que não tem
 * campo vira uma mensagem geral no topo de `root`.
 */
export function showErrors(root: HTMLElement, error: unknown): void {
  clearErrors(root)

  const fields = error instanceof ApiError ? error.fields : {}
  const unmatched: string[] = []

  for (const [name, message] of Object.entries(fields)) {
    const wrapper = root.querySelector<HTMLElement>(`[data-field="${CSS.escape(name)}"]`)
    const slot = wrapper?.querySelector<HTMLElement>('.field-error')
    if (wrapper && slot) {
      wrapper.classList.add('invalid')
      slot.hidden = false
      slot.textContent = message
    } else {
      unmatched.push(message)
    }
  }

  const general = Object.keys(fields).length === 0 ? [error instanceof Error ? error.message : 'Erro inesperado.'] : unmatched
  if (general.length > 0) {
    root.prepend(h('div', { class: 'form-error', role: 'alert' }, general.join(' ')))
  }

  root.querySelector<HTMLElement>('.field.invalid .input')?.focus()
}

/** Desabilita o botão enquanto a ação roda. */
export async function busy<T>(button: HTMLButtonElement, action: () => Promise<T>): Promise<T> {
  button.disabled = true
  try {
    return await action()
  } finally {
    button.disabled = false
  }
}

/** Abre um <dialog> modal e o remove do DOM ao fechar. */
export function modal(title: string, body: HTMLElement, foot: HTMLElement): HTMLDialogElement {
  const dialog = h(
    'dialog',
    { 'aria-label': title },
    h(
      'div',
      { class: 'dialog-head' },
      h('h2', { style: 'font-size:1.15rem' }, title),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Fechar', onClick: () => dialog.close() }, icon('x')),
    ),
    body,
    foot,
  )

  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()

  return dialog
}

export function confirmDialog(title: string, text: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false
    const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button' }, confirmLabel)
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancelar')

    const dialog = modal(
      title,
      h('div', { class: 'dialog-body' }, h('p', { style: 'margin:0' }, text)),
      h('div', { class: 'dialog-foot' }, cancel, ok),
    )

    ok.addEventListener('click', () => {
      result = true
      dialog.close()
    })
    cancel.addEventListener('click', () => dialog.close())
    dialog.addEventListener('close', () => resolve(result))
    cancel.focus()
  })
}
