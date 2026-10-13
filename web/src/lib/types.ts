export type ElectionStatus = 'draft' | 'open' | 'closed'

export interface Office {
  id: string
  name: string
  digits: number
  hasVice: boolean
}

export interface Vice {
  name: string
  photo: string | null
}

export interface Candidate {
  id: string
  officeId: string
  number: string
  name: string
  party: string
  photo: string | null
  vice: Vice | null
}

export interface Election {
  slug: string
  title: string
  description: string
  status: ElectionStatus
  createdAt: string
  updatedAt: string
  openedAt: string | null
  closedAt: string | null
  offices: Office[]
  candidates: Candidate[]
  ballots: number
}

export interface ElectionSummary {
  slug: string
  title: string
  description: string
  status: ElectionStatus
  offices: string[]
  candidates: number
  ballots: number
  updatedAt: string
}

/** Número digitado, ou `null` para voto em branco. */
export type Choices = Record<string, string | null>

export interface OfficeResult {
  office: Office
  candidates: (Candidate & { votes: number })[]
  valid: number
  blank: number
  null: number
  total: number
}

export interface Results {
  election: Election
  offices: OfficeResult[]
  ballots: number
  final: boolean
  generatedAt: string
  integrity: { consistent: boolean; hash: string }
}

export type OfficeInput = Omit<Office, 'id'> & { id?: string }

export interface ElectionInput {
  title?: string
  description?: string
  slug?: string
  offices?: OfficeInput[]
}

export interface CandidateInput {
  officeId: string
  number: string
  name: string
  party: string
  viceName?: string
}
