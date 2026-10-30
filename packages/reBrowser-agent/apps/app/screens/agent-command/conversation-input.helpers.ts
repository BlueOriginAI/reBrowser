export function shouldSubmitComposerKey({
  key,
  shiftKey,
  isComposing,
}: {
  key: string
  shiftKey: boolean
  isComposing: boolean
}): boolean {
  return key === 'Enter' && !shiftKey && !isComposing
}
