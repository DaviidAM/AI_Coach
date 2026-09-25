'use client'

import {useLocale} from 'next-intl'
import {useRouter} from 'next/navigation'
import {switchLocale} from '@/lib/api'
import styles from './LocaleSwitcher.module.css'

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value
    await switchLocale(newLocale)
    router.refresh()
  }

  return (
    <select
      className={styles.select}
      value={locale}
      onChange={handleChange}
      aria-label="Select language"
    >
      <option value="en">English</option>
      <option value="es">Español</option>
    </select>
  )
}
