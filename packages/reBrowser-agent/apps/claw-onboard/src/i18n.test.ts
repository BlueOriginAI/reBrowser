import { describe, expect, it } from 'bun:test'
import { catalogIssues } from '@browseros/i18n/core'
import { onboardingCatalogs } from './i18n'

describe('onboarding catalogs', () => {
  it('keeps English and Simplified Chinese keys and interpolation aligned', () => {
    expect(catalogIssues(onboardingCatalogs)).toEqual([])
  })
})
