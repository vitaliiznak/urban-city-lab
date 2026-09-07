import type { Object3D, Mesh } from "three";

// Corridor geometry is batched across buildings. Use retained UUID index ranges,
// never a spatial mask which could remove a neighbour's details.
export function hideExistingFacadeDetails(group: Object3D | undefined, buildingId: string, heading?: number) {
  const facing = (normal?: number[]) => heading == null || (normal != null && normal[0] * Math.sin(heading) + normal[2] * Math.cos(heading) > 0.98);
  const restore: (() => void)[] = [];
  group?.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.buildingId === buildingId && facing(mesh.userData.wallNormal)) {
      const visible = mesh.visible;
      mesh.visible = false;
      restore.push(() => {mesh.visible = visible;});
    }
    const ranges = mesh.userData.buildingRanges as {buildingId: string; wallNormal?: number[]; start: number; count: number}[] | undefined;
    const removed = ranges?.filter(range => range.buildingId === buildingId && facing(range.wallNormal));
    const index = mesh.geometry.index;
    if (!removed?.length || !index) return;
    const kept: number[] = [];
    for (let i = 0; i < index.count; i++) {
      if (!removed.some(range => i >= range.start && i < range.start + range.count)) kept.push(index.getX(i));
    }
    mesh.geometry.setIndex(kept);
    restore.push(() => {mesh.geometry.setIndex(index);});
  });
  return () => restore.forEach(fn => fn());
}
