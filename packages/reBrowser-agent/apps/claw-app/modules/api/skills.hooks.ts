/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Tasks (skills) surface: the list, one skill's detail, its run history, and
 * create / edit / delete. Mutations invalidate at the call site via
 * `Hook.getKey()`, so the cache surface stays grep-able.
 */

import type {
  Skill,
  SkillCreate,
  SkillDetail,
  SkillList,
  SkillRunList,
} from '@browseros/claw-api'
import type {
  SkillNameRequest,
  UpdateSkillRequest,
} from '@browseros/claw-api-client'
import { createMutation, createQuery } from 'react-query-kit'
import { apiClient, resolveApiBaseUrl } from './client'

export type SkillCatalogItem = {
  id: string
  name: string
  title: { zh: string; en: string }
  description: { zh: string; en: string }
  site: string
  category: string
  proOnly: boolean
  avgTokensSaved: number
  verifiedCleanRuns: number
  contentHash: string
  installed: boolean
  updateAvailable: boolean
}

export type SkillCatalogList = {
  version: number
  updatedAt: number
  items: SkillCatalogItem[]
}

export class CatalogInstallError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const useSkills = createQuery<SkillList>({
  queryKey: ['api', 'skills'],
  fetcher: async () => (await apiClient()).listSkills(),
})

export const useSkill = createQuery<SkillDetail, { name: string }, Error>({
  queryKey: ['api', 'skill'],
  fetcher: async ({ name }) => (await apiClient()).getSkill({ name }),
})

export const useSkillRuns = createQuery<SkillRunList, { name: string }, Error>({
  queryKey: ['api', 'skill-runs'],
  fetcher: async ({ name }) => (await apiClient()).listSkillRuns({ name }),
})

export const useCreateSkill = createMutation<Skill, SkillCreate>({
  mutationFn: async (body) => (await apiClient()).createSkill(body),
})

export const useUpdateSkill = createMutation<SkillDetail, UpdateSkillRequest>({
  mutationFn: async (request) => (await apiClient()).updateSkill(request),
})

export const useDeleteSkill = createMutation<void, SkillNameRequest>({
  mutationFn: async (request) => (await apiClient()).deleteSkill(request),
})

export const useSkillCatalog = createQuery<SkillCatalogList>({
  queryKey: ['api', 'skills', 'catalog'],
  fetcher: async () => {
    const baseUrl = await resolveApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/v1/skills/catalog`)
    if (!response.ok) {
      throw new Error('Failed to load verified skills catalog')
    }
    return (await response.json()) as SkillCatalogList
  },
})

export const useInstallCatalogSkill = createMutation<
  { installed: boolean; skill: Skill; helpersInstalled: number },
  { id: string }
>({
  mutationFn: async ({ id }) => {
    const baseUrl = await resolveApiBaseUrl()
    const response = await fetch(
      `${baseUrl}/api/v1/skills/catalog/${encodeURIComponent(id)}/install`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    )
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    if (!response.ok) {
      throw new CatalogInstallError(
        response.status,
        typeof data.code === 'string' ? data.code : 'install_failed',
        typeof data.message === 'string' ? data.message : 'Install failed',
      )
    }
    return data as {
      installed: boolean
      skill: Skill
      helpersInstalled: number
    }
  },
})
