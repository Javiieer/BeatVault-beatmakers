import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadAccountFavorites, setAccountFavorite, publishFavoriteChange, type AccountFavorites } from './accountFavoriteRepository'
import { scopedKey } from './storageScope'
const syncKey = (userId: string) => scopedKey('beatvault:library-favorites-sync', userId)
type State = { userId?: string; ids: Set<string>; loading: boolean; error: string; warning: string }
export function useAccountFavorites(userId?: string) {
  const [state, setState] = useState<State>({ userId, ids: new Set(), loading: Boolean(userId), error: '', warning: '' })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const generation = useRef({ value: 0 })
  const activeUser = useRef(userId)
  useLayoutEffect(() => { activeUser.current = userId; return () => { activeUser.current = undefined } }, [userId])
  const refresh = useCallback(async () => {
    const version = ++generation.current.value
    if (!userId) { setState({ userId, ids: new Set(), loading: false, error: '', warning: '' }); return }
    setState(current => ({ userId, ids: current.userId === userId ? current.ids : new Set(), loading: true, error: '', warning: '' }))
    const result = await loadAccountFavorites(userId)
    if (version !== generation.current.value || activeUser.current !== userId) return
    setState(result.ok ? { userId, ids: new Set(result.data.contentIds), loading: false, error: '', warning: result.data.migrationWarning || '' } : { userId, ids: new Set(), loading: false, error: result.error.message, warning: '' })
  }, [userId])
  useEffect(() => {
    const lifetime = generation.current
    busyRef.current = false; setBusy(false)
    void refresh()
    const changed = (event: Event) => { if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) void refresh() }
    const stored = (event: StorageEvent) => { if (userId && event.key === syncKey(userId)) void refresh() }
    window.addEventListener('beatvault:favorites-changed', changed)
    window.addEventListener('storage', stored)
    return () => { lifetime.value++; window.removeEventListener('beatvault:favorites-changed', changed); window.removeEventListener('storage', stored) }
  }, [userId, refresh])
  const change = useCallback(async (ids: string[], saved: boolean) => {
    if (!userId || busyRef.current) return false
    busyRef.current = true; setBusy(true)
    generation.current.value++
    let latest: AccountFavorites | undefined
    let message = ''
    try {
      for (const id of ids) {
        if (activeUser.current !== userId) return false
        const result = await setAccountFavorite(userId, id, saved)
        if (!result.ok) { message = result.error.message; break }
        latest = result.data
      }
      if (activeUser.current !== userId) return false
      if (latest) { setState({ userId, ids: new Set(latest.contentIds), loading: false, error: message, warning: '' }); publishFavoriteChange(userId) }
      else if (message) setState(current => current.userId === userId ? { ...current, loading: false, error: message } : current)
      return !message
    } finally { if (activeUser.current === userId) { busyRef.current = false; setBusy(false) } }
  }, [userId])
  return { ids: state.userId === userId ? state.ids : new Set<string>(), loading: Boolean(userId) && (state.userId !== userId || state.loading), error: state.userId === userId ? state.error : '', warning: state.userId === userId ? state.warning : '', busy, refresh, change }
}
