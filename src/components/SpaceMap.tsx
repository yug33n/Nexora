import type { Space } from '../types'

export function SpaceMap({ spaces, openSpace }: { spaces: Space[]; openSpace: (space: Space) => void }) {
  const center = <span className="map-center"><span className="map-core" aria-hidden="true">N</span><span className="map-caption">Nexora</span></span>
  // shortcut: switch to branches when labels no longer fit on one orbit.
  if (spaces.length > 6) return <div className="map-board map-tree" aria-label="Граф пространств">
    {center}
    <ul>{spaces.map((space) => <li key={space.id}><button className="map-node" onClick={() => openSpace(space)}>{space.name}</button></li>)}</ul>
  </div>

  const corners = [[24, 23], [76, 26], [23, 74], [77, 77]]
  const nodes = spaces.map((space, index) => {
    const angle = index * Math.PI * 2 / spaces.length - Math.PI / 2
    const [x, y] = spaces.length >= 2 && spaces.length <= 4
      ? corners[index]
      : [50 + 30 * Math.cos(angle), 50 + 34 * Math.sin(angle)]
    return { space, x, y, tone: `map-tone-${index % 4}` }
  })
  return <div className="map-board map-orbit" aria-label="Граф пространств">
    <svg className="map-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="50" cy="50" rx="30" ry="34" vectorEffect="non-scaling-stroke" />
      {nodes.map(({ space, x, y, tone }) => <line key={space.id} className={tone} x1="50" y1="50" x2={x} y2={y} vectorEffect="non-scaling-stroke" />)}
    </svg>
    {center}
    {nodes.map(({ space, x, y, tone }) => <button key={space.id} className={`map-node ${tone}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => openSpace(space)} title={space.name}>
      <span className="map-star" aria-hidden="true" />
      <span className="map-caption">{space.name}</span>
    </button>)}
  </div>
}
