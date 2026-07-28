import type { CSSProperties } from "react";

type CoreState = "idle" | "listening" | "thinking" | "speaking";

type Tile = {
  x: number;
  y: number;
  z: number;
  rotateY: number;
  rotateX: number;
  size: number;
  delay: number;
};

const RINGS = [
  { count: 6, y: -58, radius: 52, size: 27, offset: 12, missing: new Set([1]) },
  { count: 11, y: 0, radius: 78, size: 34, offset: 0, missing: new Set([3, 8]) },
  { count: 7, y: 58, radius: 56, size: 29, offset: 19, missing: new Set([5]) },
];

const TILES: Tile[] = RINGS.flatMap((ring, ringIndex) =>
  Array.from({ length: ring.count }, (_, index) => {
    if (ring.missing.has(index)) return null;
    const angle = ring.offset + (360 / ring.count) * index;
    const radians = (angle * Math.PI) / 180;
    return {
      x: Math.cos(radians) * ring.radius,
      y: ring.y,
      z: Math.sin(radians) * ring.radius,
      rotateY: 90 - angle,
      rotateX: ringIndex === 0 ? -24 : ringIndex === 2 ? 24 : 0,
      size: ring.size,
      delay: -(ringIndex * 0.35 + index * 0.13),
    };
  }).filter((tile): tile is Tile => tile !== null)
);

type TileStyle = CSSProperties & {
  "--agent-x": string;
  "--agent-y": string;
  "--agent-z": string;
  "--agent-rx": string;
  "--agent-ry": string;
  "--agent-size": string;
  "--agent-delay": string;
};

export default function AgentCore({ state = "idle" }: { state?: CoreState }) {
  return (
    <div className={`agent-core agent-core--${state}`} aria-hidden="true">
      <span className="agent-core-halo agent-core-halo--outer" />
      <span className="agent-core-halo agent-core-halo--inner" />
      <div className="agent-core-stage">
        {TILES.map((tile, index) => {
          const style: TileStyle = {
            "--agent-x": `${tile.x}px`,
            "--agent-y": `${tile.y}px`,
            "--agent-z": `${tile.z}px`,
            "--agent-rx": `${tile.rotateX}deg`,
            "--agent-ry": `${tile.rotateY}deg`,
            "--agent-size": `${tile.size}px`,
            "--agent-delay": `${tile.delay}s`,
          };
          return <span key={index} className="agent-core-tile" style={style} />;
        })}
        <span className="agent-core-heart agent-core-heart--one" />
        <span className="agent-core-heart agent-core-heart--two" />
        <span className="agent-core-heart agent-core-heart--three" />
      </div>
    </div>
  );
}
