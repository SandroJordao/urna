import '../styles/base.css'
import '../styles/admin.css'

import { ApiError, api } from '../lib/api'
import { avatar, formatDate, h, plural, statusBadge, toast } from '../lib/dom'
import { busy, clearErrors, confirmDialog, field, input, modal, showErrors } from '../lib/forms'
import { icon } from '../lib/icons'
import { mount } from '../lib/layout'
import type { Candidate, Election, ElectionSummary, OfficeInput } from '../lib/types'

const main = mount('admin')

let elections: ElectionSummary[] = []
let current: Election | null = null
let listening = false

const list = h('ul', { class: 'election-list' })
const editor = h('section', { class: 'editor', 'aria-live': 'polite' })

void start()

async function start(): Promise<void> {
  try {
    const { admin } = await api.session()
    admin ? await shell() : login()
  } catch (error) {
    main.replaceChildren(
      h(
        'div',
        { class: 'container' },
        h('div', { class: 'card empty' }, h('h2', null, 'API indisponível'), h('p', null, String((error as Error).message))),
      ),
    )
  }
}

// Login ----------------------------------------------------------------------

function login(): void {
  const user = input({ type: 'text', name: 'user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true })
  const password = input({ type: 'password', name: 'password', autocomplete: 'current-password', required: true })
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Entrar')
  const form = h(
    'form',
    { class: 'card login' },
    h('div', null, h('span', { class: 'eyebrow' }, 'Área restrita'), h('h1', null, 'Administração')),
    field('Login', 'user', user),
    field('Senha', 'password', password),
    submit,
  )

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void busy(submit, async () => {
      try {
        await api.login(user.value.trim(), password.value)
        await shell()
      } catch (error) {
        showErrors(form, error)
        password.select()
      }
    })
  })

  main.replaceChildren(form)
  user.focus()
}

// Estrutura ------------------------------------------------------------------

async function shell(): Promise<void> {
  const logout = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Sair')
  logout.addEventListener('click', async () => {
    await api.logout()
    login()
  })

  main.replaceChildren(
    h(
      'div',
      { class: 'admin' },
      h(
        'aside',
        { class: 'card sidebar' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: newElection }, icon('plus'), 'Nova eleição'),
        h('h2', null, 'Eleições'),
        list,
        logout,
      ),
      editor,
    ),
  )

  if (!listening) {
    window.addEventListener('hashchange', () => void select(slugFromHash()))
    listening = true
  }
  await refreshList()
  await select(slugFromHash() ?? elections[0]?.slug ?? null)
}

const slugFromHash = (): string | null => decodeURIComponent(location.hash.slice(1)) || null

/** Navega para uma eleição pelo hash (o listener de hashchange carrega). */
function go(slug: string | null): void {
  if (slugFromHash() === slug) void select(slug)
  else location.hash = slug ? encodeURIComponent(slug) : ''
}

async function refreshList(): Promise<void> {
  elections = await api.elections()
  renderList()
}

function renderList(): void {
  list.replaceChildren(
    ...elections.map((e) =>
      h(
        'li',
        null,
        h(
          'a',
          { class: 'election-link', href: `#${encodeURIComponent(e.slug)}`, 'aria-current': String(e.slug === current?.slug) },
          h('span', null, e.title),
          statusBadge(e.status),
        ),
      ),
    ),
  )
  if (elections.length === 0) list.append(h('li', { class: 'muted', style: 'padding:8px' }, 'Nenhuma eleição.'))
}

async function select(slug: string | null): Promise<void> {
  if (!slug) {
    current = null
    editor.replaceChildren(
      h('div', { class: 'card empty' }, h('h2', null, 'Nenhuma eleição'), h('p', null, 'Crie uma eleição para começar.')),
    )
    renderList()
    return
  }

  try {
    current = await api.election(slug)
    renderEditor()
  } catch (error) {
    current = null
    editor.replaceChildren(
      h('div', { class: 'card empty' }, h('h2', null, 'Eleição não encontrada'), h('p', null, (error as Error).message)),
    )
  }
  renderList()
}

/** Recarrega a eleição atual e a lista após uma alteração. */
async function reload(): Promise<void> {
  if (!current) return
  await Promise.all([select(current.slug), refreshList()])
}

/** Executa uma ação da API mostrando o erro em um toast. */
async function attempt(action: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await action()
    if (success) toast(success)
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      login()
      return false
    }
    toast((error as Error).message, 'error')
    return false
  }
}

// Editor ---------------------------------------------------------------------

function renderEditor(): void {
  const e = current!
  const draft = e.status === 'draft'

  editor.replaceChildren(
    header(e),
    draft
      ? ''
      : h(
          'div',
          { class: 'frozen' },
          'Cadastro congelado enquanto a eleição não está em rascunho, para que a cédula não mude durante a votação.',
          e.ballots > 0 ? ' Para editar, zere os votos.' : ' Volte para rascunho para editar.',
        ),
    detailsPanel(e),
    officesPanel(e),
    candidatesPanel(e),
  )
}

function header(e: Election): HTMLElement {
  const slug = encodeURIComponent(e.slug)
  const actions: HTMLElement[] = []
  const status = (label: string, next: Election['status'], primary = false) =>
    h(
      'button',
      {
        class: `btn ${primary ? 'btn-primary' : ''}`,
        type: 'button',
        onClick: async () => {
          if (
            next === 'closed' &&
            !(await confirmDialog(
              'Encerrar votação?',
              'Depois de encerrada, a votação não pode ser reaberta e os resultados ficam públicos.',
              'Encerrar',
            ))
          )
            return
          if (await attempt(() => api.setStatus(e.slug, next), 'Situação atualizada.')) await reload()
        },
      },
      label,
    )

  if (e.status === 'draft') actions.push(status('Abrir votação', 'open', true))
  if (e.status === 'open') {
    actions.push(h('a', { class: 'btn btn-primary', href: `./votar.html?e=${slug}`, target: '_blank' }, icon('external'), 'Abrir urna'))
    actions.push(status('Encerrar votação', 'closed'))
    if (e.ballots === 0) actions.push(status('Voltar a rascunho', 'draft'))
  }
  if (e.status !== 'draft') {
    actions.push(
      h('a', { class: 'btn', href: `./resultados.html?e=${slug}`, target: '_blank' }, e.status === 'closed' ? 'Resultados' : 'Parcial'),
    )
  }
  if (e.ballots > 0 || e.status === 'closed') {
    actions.push(
      h(
        'button',
        {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: async () => {
            const ok = await confirmDialog(
              'Zerar votos?',
              `Os ${plural(e.ballots, 'voto', 'votos')} serão apagados e a eleição volta a rascunho. Use apenas em demonstrações.`,
              'Zerar votos',
              true,
            )
            if (ok && (await attempt(() => api.resetElection(e.slug), 'Votos zerados.'))) await reload()
          },
        },
        'Zerar votos',
      ),
    )
  }
  actions.push(
    h(
      'button',
      {
        class: 'btn btn-danger',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog(
            'Excluir eleição?',
            `"${e.title}", seus candidatos, fotos e votos serão apagados permanentemente.`,
            'Excluir',
            true,
          )
          if (ok && (await attempt(() => api.deleteElection(e.slug), 'Eleição excluída.'))) {
            current = null
            await refreshList()
            go(elections[0]?.slug ?? null)
          }
        },
      },
      icon('trash', 16),
      'Excluir',
    ),
  )

  return h(
    'div',
    { class: 'card panel' },
    h(
      'div',
      { class: 'editor-title' },
      h('div', { class: 'row' }, statusBadge(e.status), h('span', { class: 'editor-meta' }, e.slug)),
      h('h1', null, e.title),
      h(
        'div',
        { class: 'editor-meta' },
        `${plural(e.ballots, 'voto', 'votos')} · aberta ${formatDate(e.openedAt)} · encerrada ${formatDate(e.closedAt)}`,
      ),
    ),
    h('div', { class: 'row' }, ...actions),
  )
}

function detailsPanel(e: Election): HTMLElement {
  const title = input({ name: 'title', value: e.title, maxlength: 80, required: true })
  const description = h('textarea', { class: 'input', name: 'description', maxlength: 280, rows: 2, value: e.description })
  const save = h('button', { class: 'btn', type: 'submit' }, 'Salvar dados')

  const form = h(
    'form',
    { class: 'card panel' },
    h('div', { class: 'panel-head' }, h('h2', null, 'Dados da eleição')),
    field('Título', 'title', title),
    field('Descrição', 'description', description),
    h('div', { class: 'row' }, save),
  )

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void busy(save, async () => {
      try {
        await api.updateElection(e.slug, { title: title.value, description: description.value })
        toast('Dados salvos.')
        await reload()
      } catch (error) {
        showErrors(form, error)
      }
    })
  })

  return form
}

function officesPanel(e: Election): HTMLElement {
  const draft = e.status === 'draft'
  const offices: OfficeInput[] = e.offices.map((o) => ({ ...o }))
  const rows = h('div', { class: 'office-rows' })
  const save = h('button', { class: 'btn', type: 'submit', disabled: !draft }, 'Salvar cargos')

  const render = () => {
    rows.replaceChildren(
      ...offices.map((office, i) => {
        const name = input({
          value: office.name,
          maxlength: 40,
          placeholder: 'Ex.: Governador',
          disabled: !draft,
          'aria-label': 'Nome do cargo',
        })
        name.addEventListener('input', () => (office.name = name.value))

        const digits = h(
          'select',
          { class: 'input', disabled: !draft, 'aria-label': 'Quantidade de dígitos' },
          ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), selected: n === office.digits }, plural(n, 'dígito', 'dígitos'))),
        )
        digits.addEventListener('change', () => (office.digits = Number(digits.value)))

        const vice = h('input', { type: 'checkbox', checked: office.hasVice, disabled: !draft })
        vice.addEventListener('change', () => (office.hasVice = vice.checked))

        const move = (delta: number) => () => {
          const [item] = offices.splice(i, 1)
          offices.splice(i + delta, 0, item!)
          render()
        }

        return h(
          'div',
          { class: 'office-row' },
          h('div', { class: 'field', dataset: { field: `offices.${i}.name` } }, name, h('small', { class: 'field-error', hidden: true })),
          h(
            'div',
            { class: 'field', dataset: { field: `offices.${i}.digits` } },
            digits,
            h('small', { class: 'field-error', hidden: true }),
          ),
          h('label', { class: 'check' }, vice, 'Vice'),
          h(
            'div',
            { class: 'office-tools' },
            h(
              'button',
              { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Subir', disabled: !draft || i === 0, onClick: move(-1) },
              icon('up'),
            ),
            h(
              'button',
              {
                class: 'btn btn-ghost btn-icon',
                type: 'button',
                title: 'Descer',
                disabled: !draft || i === offices.length - 1,
                onClick: move(1),
              },
              icon('down'),
            ),
            h(
              'button',
              {
                class: 'btn btn-ghost btn-icon',
                type: 'button',
                title: 'Remover',
                disabled: !draft || offices.length === 1,
                onClick: () => {
                  offices.splice(i, 1)
                  render()
                },
              },
              icon('trash', 16),
            ),
          ),
        )
      }),
    )
  }

  const add = h(
    'button',
    {
      class: 'btn btn-ghost',
      type: 'button',
      disabled: !draft || offices.length >= 8,
      onClick: () => {
        offices.push({ name: '', digits: 2, hasVice: false })
        render()
        rows.querySelector<HTMLInputElement>('.office-row:last-child input')?.focus()
      },
    },
    icon('plus'),
    'Adicionar cargo',
  )

  const form = h(
    'form',
    { class: 'card panel' },
    h(
      'div',
      { class: 'panel-head' },
      h('h2', null, 'Cargos'),
      h('p', null, 'Votados nesta ordem. A quantidade de dígitos define o tamanho do número dos candidatos.'),
    ),
    rows,
    h('div', { class: 'field', dataset: { field: 'offices' } }, h('small', { class: 'field-error', hidden: true })),
    h('div', { class: 'row' }, add, h('span', { class: 'spacer' }), save),
  )

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void busy(save, async () => {
      try {
        clearErrors(form)
        await api.updateElection(e.slug, { offices })
        toast('Cargos salvos.')
        await reload()
      } catch (error) {
        showErrors(form, error)
      }
    })
  })

  render()
  return form
}

function candidatesPanel(e: Election): HTMLElement {
  const draft = e.status === 'draft'

  const groups = e.offices.map((office) => {
    const candidates = e.candidates.filter((c) => c.officeId === office.id)

    return h(
      'div',
      { class: 'office-group' },
      h('h3', null, office.name, h('span', { class: 'muted' }, `· ${plural(office.digits, 'dígito', 'dígitos')}`)),
      candidates.length === 0
        ? h('p', { class: 'missing', style: 'margin:0' }, 'Nenhum candidato. Cadastre ao menos um para abrir a votação.')
        : h('div', { class: 'candidate-grid' }, ...candidates.map((c, i) => candidateCard(e, c, i, draft))),
    )
  })

  return h(
    'section',
    { class: 'card panel' },
    h(
      'div',
      { class: 'panel-head' },
      h('h2', null, 'Candidatos'),
      h('span', { class: 'muted' }, `(${e.candidates.length})`),
      h('span', { class: 'spacer' }),
      h(
        'button',
        { class: 'btn btn-primary btn-sm', type: 'button', disabled: !draft, onClick: () => candidateDialog(e, null) },
        icon('plus', 16),
        'Novo candidato',
      ),
    ),
    ...groups,
  )
}

function candidateCard(e: Election, c: Candidate, index: number, draft: boolean): HTMLElement {
  const office = e.offices.find((o) => o.id === c.officeId)
  const missingVice = office?.hasVice && !c.vice

  return h(
    'article',
    { class: 'candidate-card', style: `animation-delay: ${index * 40}ms` },
    avatar(c.name, c.photo),
    h(
      'div',
      null,
      h('div', { class: 'candidate-number' }, c.number),
      h('h4', null, c.name),
      h('p', null, c.party || 'Sem partido'),
      c.vice ? h('p', null, `Vice: ${c.vice.name}`) : missingVice ? h('p', { class: 'missing' }, 'Vice não informado') : null,
    ),
    draft
      ? h(
          'div',
          { class: 'row candidate-actions' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => candidateDialog(e, c) }, icon('edit', 14), 'Editar'),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              onClick: async () => {
                const ok = await confirmDialog(
                  'Excluir candidato?',
                  `${c.number} · ${c.name} será removido junto com as fotos.`,
                  'Excluir',
                  true,
                )
                if (ok && (await attempt(() => api.deleteCandidate(e.slug, c.id), 'Candidato excluído.'))) await reload()
              },
            },
            icon('trash', 14),
            'Excluir',
          ),
        )
      : null,
  )
}

// Diálogos -------------------------------------------------------------------

function newElection(): void {
  const title = input({ name: 'title', maxlength: 80, required: true, placeholder: 'Ex.: Eleição do Condomínio 2026' })
  const description = h('textarea', { class: 'input', name: 'description', maxlength: 280, rows: 2 })
  const create = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Criar eleição')

  const body = h(
    'div',
    { class: 'dialog-body' },
    field('Título', 'title', title),
    field('Descrição (opcional)', 'description', description),
    h('div', { dataset: { field: 'slug' } }, h('small', { class: 'field-error', hidden: true })),
    h(
      'p',
      { class: 'muted', style: 'margin:0;font-size:.85rem' },
      'A eleição começa com o cargo "Presidente"; você pode alterar os cargos em seguida.',
    ),
  )
  const form = h('form', null, body, h('div', { class: 'dialog-foot' }, create))
  const dialog = modal('Nova eleição', form, h('div'))

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void busy(create, async () => {
      try {
        const election = await api.createElection({ title: title.value, description: description.value })
        dialog.close()
        toast('Eleição criada.')
        await refreshList()
        go(election.slug)
      } catch (error) {
        showErrors(body, error)
      }
    })
  })

  title.focus()
}

function candidateDialog(e: Election, candidate: Candidate | null): void {
  const office = h(
    'select',
    { class: 'input', name: 'officeId' },
    ...e.offices.map((o) => h('option', { value: o.id, selected: o.id === candidate?.officeId }, o.name)),
  )
  const number = input({ name: 'number', inputmode: 'numeric', autocomplete: 'off', value: candidate?.number ?? '', required: true })
  const name = input({ name: 'name', maxlength: 60, value: candidate?.name ?? '', required: true })
  const party = input({ name: 'party', maxlength: 40, value: candidate?.party ?? '', placeholder: 'Partido, chapa ou grupo' })
  const viceName = input({ name: 'viceName', maxlength: 60, value: candidate?.vice?.name ?? '' })

  const mainPhoto = photoPicker('Foto do candidato', candidate?.photo ?? null, () => name.value)
  const vicePhoto = photoPicker('Foto do vice', candidate?.vice?.photo ?? null, () => viceName.value)
  const viceFields = h('div', { class: 'stack' }, field('Nome do vice', 'viceName', viceName))

  const selectedOffice = () => e.offices.find((o) => o.id === office.value) ?? e.offices[0]!
  const sync = () => {
    const o = selectedOffice()
    number.maxLength = o.digits
    number.placeholder = '0'.repeat(o.digits)
    viceFields.hidden = !o.hasVice
    vicePhoto.element.hidden = !o.hasVice
  }
  office.addEventListener('change', sync)
  number.addEventListener('input', () => (number.value = number.value.replace(/\D/g, '')))
  sync()

  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, candidate ? 'Salvar' : 'Cadastrar')
  const body = h(
    'div',
    { class: 'dialog-body' },
    h('div', { class: 'form-grid' }, field('Cargo', 'officeId', office), field('Número', 'number', number)),
    field('Nome', 'name', name),
    field('Partido', 'party', party),
    viceFields,
    h(
      'div',
      { class: 'photo-fields', dataset: { field: 'photo' } },
      mainPhoto.element,
      vicePhoto.element,
      h('small', { class: 'field-error', hidden: true }),
    ),
  )
  const form = h('form', null, body, h('div', { class: 'dialog-foot' }, save))
  const dialog = modal(candidate ? `Editar ${candidate.name}` : 'Novo candidato', form, h('div'))

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void busy(save, async () => {
      const o = selectedOffice()
      const payload = {
        officeId: o.id,
        number: number.value,
        name: name.value,
        party: party.value,
        viceName: o.hasVice ? viceName.value : undefined,
      }

      try {
        // Primeiro os dados; se a foto falhar, o candidato já existe e o
        // diálogo passa a editá-lo em vez de criar outro.
        candidate = candidate ? await api.updateCandidate(e.slug, candidate.id, payload) : await api.addCandidate(e.slug, payload)
        await mainPhoto.commit(e.slug, candidate.id, 'candidate')
        if (o.hasVice) await vicePhoto.commit(e.slug, candidate.id, 'vice')

        dialog.close()
        toast('Candidato salvo.')
        await reload()
      } catch (error) {
        showErrors(body, error)
      }
    })
  })

  ;(candidate ? name : number).focus()
}

interface PhotoPicker {
  element: HTMLElement
  /** Envia a nova foto, ou remove a atual, conforme escolhido no diálogo. */
  commit(slug: string, id: string, target: 'candidate' | 'vice'): Promise<void>
}

function photoPicker(label: string, photo: string | null, getName: () => string): PhotoPicker {
  let file: File | null = null
  let remove = false
  let previewUrl: string | null = null

  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' })
  const preview = h('div')
  const removeButton = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Remover')
  const id = `photo-${Math.random().toString(36).slice(2)}`
  fileInput.id = id

  const paint = () => {
    const shown = previewUrl ? null : remove ? null : photo
    const img = previewUrl ? h('img', { class: 'avatar', src: previewUrl, alt: 'Pré-visualização' }) : avatar(getName() || '?', shown)
    preview.replaceChildren(img)
    removeButton.hidden = !(previewUrl || (photo && !remove))
  }

  const choose = (selected: File | undefined) => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) {
      toast('Escolha uma imagem.', 'error')
      return
    }
    file = selected
    remove = false
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = URL.createObjectURL(selected)
    paint()
  }

  fileInput.addEventListener('change', () => choose(fileInput.files?.[0]))
  removeButton.addEventListener('click', () => {
    file = null
    remove = true
    fileInput.value = ''
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
    paint()
  })

  const element = h(
    'div',
    { class: 'photo-picker' },
    preview,
    h(
      'div',
      { class: 'stack' },
      h('strong', { style: 'font-size:.9rem' }, label),
      h('label', { class: 'btn btn-sm', for: id }, icon('image', 16), 'Escolher imagem'),
      fileInput,
      removeButton,
      h('small', { class: 'muted' }, 'JPG, PNG ou WebP até 3 MB. Arraste aqui.'),
    ),
  )

  // Arrastar e soltar.
  element.addEventListener('dragover', (event) => {
    event.preventDefault()
    element.classList.add('dragging')
  })
  element.addEventListener('dragleave', () => element.classList.remove('dragging'))
  element.addEventListener('drop', (event) => {
    event.preventDefault()
    element.classList.remove('dragging')
    choose(event.dataTransfer?.files[0])
  })

  paint()

  return {
    element,
    async commit(slug, candidateId, target) {
      if (file) {
        const updated = await api.uploadPhoto(slug, candidateId, target, file)
        photo = target === 'vice' ? (updated.vice?.photo ?? null) : updated.photo
        file = null
      } else if (remove && photo) {
        await api.removePhoto(slug, candidateId, target)
        photo = null
      }
      remove = false
    },
  }
}
