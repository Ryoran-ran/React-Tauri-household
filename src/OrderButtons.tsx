import { ArrowDown, ArrowUp } from "lucide-react";

export function movedIds(items: { id: number }[], index: number, step: number) {
  const ids = items.map((item) => item.id);
  const target = index + step;
  if (target < 0 || target >= ids.length) return ids;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

export default function OrderButtons({
  name,
  index,
  count,
  busy,
  onMove,
}: {
  name: string;
  index: number;
  count: number;
  busy: boolean;
  onMove: (step: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={`${name}を上へ移動`}
        title="上へ移動"
        disabled={busy || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={17} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`${name}を下へ移動`}
        title="下へ移動"
        disabled={busy || index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={17} />
      </button>
    </>
  );
}
