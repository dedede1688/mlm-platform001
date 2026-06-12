import { useTranslations } from 'next-intl'

export function useTranslation(namespace?: string) {
  return useTranslations(namespace)
}
