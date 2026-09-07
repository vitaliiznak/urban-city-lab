import type { FacadeDescription, PhotoFacadeJob, StreetWall } from "./types";

/** Map one photographed elevation across its measured wall and setback planes. */
export function projectElevation(walls: StreetWall[], description: FacadeDescription, heading: number): NonNullable<PhotoFacadeJob["reviewedFaces"]> {
  const nx = Math.sin(heading), nz = Math.cos(heading);
  const facing = walls.filter(w => w.normal[0] * nx + w.normal[2] * nz > 0.98);
  if (!facing.length) return [];
  const front = Math.max(...facing.map(w => w.plane));
  // Deep courtyard/internal walls are not the elevation photographed from outside.
  const surfaces = facing.filter(w => front - w.plane < 2).sort((a,b) => b.plane-a.plane);
  const left = Math.min(...surfaces.map(w => w.uMin));
  const right = Math.max(...surfaces.map(w => w.uMax));
  const ground = Math.min(...surfaces.map(w => w.visibleBase));
  const top = Math.max(...surfaces.map(w => w.yMax));
  const width = right-left, height = top-ground;
  if (width <= 0 || height <= 0) return [];
  const result = surfaces.map(wall => ({wallId: wall.id, facade: {...description, wallId: wall.id, elements: [] as FacadeDescription["elements"]}}));
  const covers = (wall: StreetWall, u: number, y: number) => u >= wall.uMin-0.002 && u <= wall.uMax+0.002 && y >= wall.visibleBase-0.002 && y <= wall.yMax+0.002;
  for (const element of description.elements) {
    const x0 = left+(element.x-element.width/2)*width;
    const x1 = left+(element.x+element.width/2)*width;
    const y0 = ground+(element.y-element.height/2)*height;
    const y1 = ground+(element.y+element.height/2)*height;
    surfaces.forEach((wall,i) => {
      const a = Math.max(x0,wall.uMin), b = Math.min(x1,wall.uMax);
      const bottom = Math.max(y0,wall.visibleBase), upper = Math.min(y1,wall.yMax);
      if (b-a < 0.02 || upper-bottom < 0.02) return;
      const u = (a+b)/2, y = (bottom+upper)/2;
      if (surfaces.some(other => other.plane > wall.plane+0.05 && covers(other,u,y))) return;
      const wallWidth = wall.uMax-wall.uMin, wallHeight = wall.yMax-wall.visibleBase;
      result[i].facade.elements.push({...element,x:(u-wall.uMin)/wallWidth,y:(y-wall.visibleBase)/wallHeight,width:(b-a)/wallWidth,height:(upper-bottom)/wallHeight});
    });
  }
  return result;
}
