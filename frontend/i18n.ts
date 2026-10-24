import {notFound} from 'next/navigation'
import {getRequestConfig} from 'next-intl/server'

export const locales = ['en', 'es'] as const
export const defaultLocale = 'en' as const

export default getRequestConfig(async ({locale: maybeLocale}) => {
  const locale = maybeLocale ?? defaultLocale
  if (!locales.includes(locale as typeof locales[number])) {
    notFound()
  }
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
