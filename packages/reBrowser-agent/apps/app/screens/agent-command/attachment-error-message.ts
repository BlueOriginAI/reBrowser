import type { useLocale } from '@browseros/i18n/react'
import type { AttachmentValidationError } from '@/lib/attachments'

type Translate = ReturnType<typeof useLocale>['t']

export function attachmentErrorMessage(
  error: AttachmentValidationError,
  t: Translate,
): string {
  switch (error.code) {
    case 'unsupported_type':
      return t('surfaces.attachmentType', { type: error.mediaType })
    case 'too_many': {
      const overflow =
        /^Only the first (\d+) of (\d+) files were attached \(max (\d+)\)\.$/.exec(
          error.message,
        )
      if (overflow)
        return t('surfaces.attachmentOverflow', {
          attached: overflow[1],
          total: overflow[2],
          limit: overflow[3],
        })
      const limit = /^At most (\d+) attachments per message\.$/.exec(
        error.message,
      )
      return limit
        ? t('surfaces.attachmentLimit', { limit: limit[1] })
        : t('Too many attachments.')
    }
    case 'too_large': {
      const match = /^(Image|File) "(.*)" is too large \(max (.*)\)\.$/.exec(
        error.message,
      )
      if (match)
        return t(
          match[1] === 'Image'
            ? 'surfaces.imageTooLarge'
            : 'surfaces.fileTooLarge',
          { name: match[2], limit: match[3] },
        )
      return t('Attachment is too large.')
    }
    case 'read_failed':
      return t('Unable to read the attachment. Please try again.')
  }
}
