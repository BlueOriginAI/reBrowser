import { useLocale } from '@browseros/i18n/react'
import { CONVERSATION_ID_PLACEHOLDER } from '@browseros/shared/schemas/llm'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ProviderFormMessage } from './ProviderLocalizedUi'
import type { ProviderFormValues } from './provider-form-schema'

export function ProviderHeadersFields() {
  const { t } = useLocale()
  const form = useFormContext<ProviderFormValues>()
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'headers',
  })

  return (
    <fieldset className="space-y-3">
      <legend className="font-medium text-sm">{t('Custom headers')}</legend>
      <p className="text-muted-foreground text-xs">
        {t('Sent with every request to this provider. Use')}{' '}
        <code>{CONVERSATION_ID_PLACEHOLDER}</code>{' '}
        {t(
          'for a stable ID within each conversation. Connection tests use a separate session ID.',
        )}
      </p>
      {fields.map((header, index) => (
        <div key={header.id} className="space-y-2">
          <div className="flex items-start gap-2">
            <FormField
              control={form.control}
              name={`headers.${index}.name`}
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1">
                  <FormLabel>{t('Header name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="X-Custom-Header" {...field} />
                  </FormControl>
                  <ProviderFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`headers.${index}.value`}
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1">
                  <FormLabel>{t('Header value')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      placeholder={t('value')}
                      {...field}
                    />
                  </FormControl>
                  <ProviderFormMessage />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6"
              aria-label={t('Remove header {number}', { number: index + 1 })}
              onClick={() => remove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() =>
              form.setValue(
                `headers.${index}.value`,
                CONVERSATION_ID_PLACEHOLDER,
                { shouldDirty: true, shouldValidate: true },
              )
            }
          >
            {t('Use conversation ID')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ name: '', value: '' })}
      >
        <Plus className="mr-2 size-4" />
        {t('Add header')}
      </Button>
    </fieldset>
  )
}
