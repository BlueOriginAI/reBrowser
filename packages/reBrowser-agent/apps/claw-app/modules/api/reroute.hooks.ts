import { createMutation, createQuery } from 'react-query-kit'
import { resolveApiBaseUrl } from './client'

export type ReroutePeerDevice = {
  installationId: string
  deviceName: string
  os: string
  appVersion: string
  online: boolean
  allowIncoming: boolean
  rttMs?: number
  isSelf: boolean
}

export type RerouteState = {
  signedIn: boolean
  email: string
  displayName: string
  entitlement: string
  vipExpiresAt?: number
  isPro: boolean
  selfInstallationId: string
  selfDeviceName: string
  allowIncomingReroute: boolean
  targetDeviceId?: string
  targetDeviceName?: string
  relayConnected: boolean
  devices: ReroutePeerDevice[]
}

export class RerouteApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function fetchRerouteJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = await resolveApiBaseUrl()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new RerouteApiError(
      response.status,
      typeof data.code === 'string' ? data.code : 'reroute_error',
      typeof data.message === 'string' ? data.message : 'Request failed',
    )
  }
  return data as T
}

export const useRerouteState = createQuery<RerouteState>({
  queryKey: ['api', 'reroute', 'state'],
  fetcher: () => fetchRerouteJson<RerouteState>('/api/v1/reroute/state'),
})

export const useSetRerouteTarget = createMutation<
  RerouteState,
  { targetDeviceId: string | null }
>({
  mutationFn: (body) =>
    fetchRerouteJson<RerouteState>('/api/v1/reroute/target', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
})

export const useSetReroutePreferences = createMutation<
  RerouteState,
  { allowIncomingReroute: boolean }
>({
  mutationFn: (body) =>
    fetchRerouteJson<RerouteState>('/api/v1/reroute/preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
})
