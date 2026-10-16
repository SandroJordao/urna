import type { Candidate, CandidateInput, Choices, Election, ElectionInput, ElectionStatus, ElectionSummary, Results } from './types'

/**
 * As páginas ficam em /public (build) ou na raiz do Vite (dev); em ambos os
 * casos a API e os uploads estão um nível acima.
 */
const ROOT = (import.meta.env.VITE_ROOT_URL ?? '..').replace(/\/$/, '')
const API = `${ROOT}/api`

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'urna' }
  let payload: BodyInit | undefined

  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(API + path, { method, headers, body: payload, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Erro ${response.status}.`, data?.fields ?? {})
  }

  return data as T
}

const e = (slug: string) => `/elections/${encodeURIComponent(slug)}`

export const api = {
  session: () => request<{ admin: boolean }>('GET', '/auth'),
  login: (user: string, password: string) => request<{ admin: boolean }>('POST', '/auth/login', { user, password }),
  logout: () => request<{ admin: boolean }>('POST', '/auth/logout'),

  elections: () => request<ElectionSummary[]>('GET', '/elections'),
  election: (slug: string) => request<Election>('GET', e(slug)),
  createElection: (input: ElectionInput) => request<Election>('POST', '/elections', input),
  updateElection: (slug: string, input: ElectionInput) => request<Election>('PATCH', e(slug), input),
  setStatus: (slug: string, status: ElectionStatus) => request<Election>('PATCH', e(slug), { status }),
  resetElection: (slug: string) => request<Election>('POST', `${e(slug)}/reset`),
  deleteElection: (slug: string) => request<void>('DELETE', e(slug)),

  addCandidate: (slug: string, input: CandidateInput) => request<Candidate>('POST', `${e(slug)}/candidates`, input),
  updateCandidate: (slug: string, id: string, input: CandidateInput) => request<Candidate>('PATCH', `${e(slug)}/candidates/${id}`, input),
  deleteCandidate: (slug: string, id: string) => request<void>('DELETE', `${e(slug)}/candidates/${id}`),
  uploadPhoto: (slug: string, id: string, target: 'candidate' | 'vice', file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return request<Candidate>('POST', `${e(slug)}/candidates/${id}/photo?target=${target}`, form)
  },
  removePhoto: (slug: string, id: string, target: 'candidate' | 'vice') =>
    request<Candidate>('DELETE', `${e(slug)}/candidates/${id}/photo?target=${target}`),

  vote: (slug: string, choices: Choices) => request<{ recorded: true }>('POST', `${e(slug)}/ballots`, { choices }),
  results: (slug: string) => request<Results>('GET', `${e(slug)}/results`),
}

/** URL pública de um arquivo salvo pela API (ex.: uploads/eleicao/foto.webp). */
export const assetUrl = (path: string): string => `${ROOT}/${path}`
