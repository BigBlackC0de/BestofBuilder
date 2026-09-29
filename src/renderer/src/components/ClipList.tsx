import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { ClipRow, type ClipState } from './ClipRow'

interface ClipListProps {
  clips: ClipState[]
  locked: boolean
  onChange: (clips: ClipState[]) => void
  onEdit: (id: string) => void
}

/** Liste de montage : cases à cocher et réordonnancement par glisser-déposer (souris ou clavier). */
export function ClipList({ clips, locked, onChange, onEdit }: ClipListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = clips.findIndex((c) => c.entry.id === active.id)
    const to = clips.findIndex((c) => c.entry.id === over.id)
    if (from >= 0 && to >= 0) onChange(arrayMove(clips, from, to))
  }

  const toggle = (id: string) =>
    onChange(clips.map((c) => (c.entry.id === id ? { ...c, selected: !c.selected } : c)))

  let order = 0
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={clips.map((c) => c.entry.id)} strategy={verticalListSortingStrategy}>
        <ul className="clip-list">
          {clips.map((clip) => (
            <ClipRow
              key={clip.entry.id}
              clip={clip}
              order={clip.selected ? ++order : null}
              locked={locked}
              onToggle={toggle}
              onEdit={onEdit}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
