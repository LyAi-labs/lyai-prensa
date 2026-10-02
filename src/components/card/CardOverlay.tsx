import type { NewsItem } from '../../data/newsApi'
import { AnchoredOverlay } from '../../shared/components/anchored-overlay'
import NewsCard from './NewsCard'

// Una única card DOM que se coloca sobre la card del canvas WebGL bajo el
// cursor/dedo (o abre el detalle de una tesela). La capa es genérica
// (shared/anchored-overlay); aquí solo se pone la NewsCard dentro.
export type OverlayState = {
  item: NewsItem
  cx: number // centro de la card del canvas, en px de pantalla
  cy: number
  flipped: boolean
  sticky: boolean // abierta con el dedo: se cierra tocando fuera
  storyCount: number
  contrarioEnlace?: string
  related?: NewsItem[]
}

export default function CardOverlay({
  state,
  onToggle,
  onClose,
}: {
  state: OverlayState
  onToggle: () => void
  onClose: () => void
}) {
  return (
    <AnchoredOverlay
      cx={state.cx}
      cy={state.cy}
      modal={state.flipped}
      sticky={state.sticky}
      onClose={onClose}
      contentKey={state.item.id}
    >
      {({ shouldIgnoreClick }) => (
        <NewsCard
          item={state.item}
          flipped={state.flipped}
          onToggle={() => {
            if (shouldIgnoreClick()) return
            onToggle()
          }}
          contrarioEnlace={state.contrarioEnlace}
          peek
          storyCount={state.storyCount}
          related={state.related}
        />
      )}
    </AnchoredOverlay>
  )
}
