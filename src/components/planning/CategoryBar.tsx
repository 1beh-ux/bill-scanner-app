// Left color mark of an activity card, split by main category share (see
// mainCategorySegments). Parent must be `relative`.
export default function CategoryBar({ segments }: { segments: { color: string; weight: number }[] }) {
  return (
    <div className="absolute inset-y-0 left-0 flex w-1 flex-col overflow-hidden rounded-l" aria-hidden="true">
      {segments.length === 0 ? (
        <div className="flex-1 bg-[#9ca3af]" />
      ) : (
        segments.map((s, i) => <div key={i} style={{ flexGrow: s.weight, backgroundColor: s.color }} />)
      )}
    </div>
  );
}
