import type { FC, ReactNode } from 'react'

// The upstream Product Hunt campaign does not promote this fork.
export const ProductHuntBannerCard: FC<{
  onOpen: () => void
  onDismiss: () => void
}> = () => null

export const ProductHuntBanner: FC<{ fallback?: ReactNode }> = ({
  fallback = null,
}) => fallback
