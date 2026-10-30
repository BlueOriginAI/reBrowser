import { useLocale } from '@browseros/i18n/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronRight, Lightbulb } from 'lucide-react'
import type { FC } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { LocalizedDialogContent as DialogContent } from '@/components/i18n/LocalizedDialogContent'
import { LocalizedFormMessage as FormMessage } from '@/components/i18n/LocalizedFormMessage'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type FormValues = {
  name: string
  url: string
  description?: string
}

function createFormSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t('mcp.serverNameRequired')),
    url: z.string().url(t('mcp.urlRequired')),
    description: z.string().optional(),
  })
}

export interface AddCustomMCPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddServer: (config: {
    name: string
    url: string
    description: string
  }) => void
}

export const AddCustomMCPDialog: FC<AddCustomMCPDialogProps> = ({
  open,
  onOpenChange,
  onAddServer,
}) => {
  const { t } = useLocale()
  const form = useForm<FormValues>({
    resolver: zodResolver(createFormSchema((key) => key)),
    defaultValues: {
      name: '',
      url: '',
      description: '',
    },
  })

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset()
    }
    onOpenChange(isOpen)
  }

  const onSubmit = (values: FormValues) => {
    onAddServer({
      name: values.name,
      url: values.url,
      description: values.description ?? '',
    })
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mcp.addCustomApp')}</DialogTitle>
          <DialogDescription>{t('mcp.customAppDescription')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('mcp.serverName')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('mcp.serverNamePlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('mcp.serverUrlLabel')}</FormLabel>
                  <FormDescription>{t('mcp.httpOnly')}</FormDescription>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="http://mcp.example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('mcp.descriptionOptional')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('mcp.descriptionPlaceholder')}
                      rows={3}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Collapsible>
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 rounded-md border border-[var(--accent-orange)]/30 bg-[var(--accent-orange)]/5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent-orange)]/10">
                <Lightbulb className="h-4 w-4 shrink-0 text-[var(--accent-orange)]" />
                <span className="flex-1 font-medium">{t('mcp.findUrl')}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 rounded-md border border-[var(--accent-orange)]/30 bg-[var(--accent-orange)]/5 px-3 py-2 text-muted-foreground text-sm">
                {t('mcp.findUrlDescription')}
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange-bright)]"
              >
                {t('mcp.addServer')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
