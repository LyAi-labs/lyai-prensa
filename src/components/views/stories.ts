import type { NewsItem } from '../../data/newsApi'
import { storyKey } from '../card/cardUtils'

export type StoryNode = { item: NewsItem; group: NewsItem[]; day: string }

// Una pieza por historia: los titulares idénticos (copias del mismo grupo
// editorial) se funden en una sola, con la lista de medios en `group`.
export function buildStoryNodes(items: NewsItem[]): StoryNode[] {
  const groups = new Map<string, NewsItem[]>()
  for (const it of items) {
    const k = storyKey(it.headline) || it.id
    const g = groups.get(k)
    if (g) g.push(it)
    else groups.set(k, [it])
  }
  const seen = new Set<string>()
  const out: StoryNode[] = []
  for (const it of items) {
    const k = storyKey(it.headline) || it.id
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ item: it, group: groups.get(k) ?? [it], day: it.publishedAt.slice(0, 5) })
  }
  return out
}
