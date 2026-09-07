import {samplePolyline} from './bus-route.js';

export function travelProgress(elapsed, duration) {
  if (duration <= 0) return 1;
  const t = Math.max(0, Math.min(duration, elapsed));
  const ramp = Math.min(6, duration * .18);
  const integral = value => {
    const u = value / ramp;
    return ramp * (u ** 3 - .5 * u ** 4);
  };
  const area = duration - ramp;
  if (t < ramp) return integral(t) / area;
  if (t > duration - ramp) return 1 - integral(duration - t) / area;
  return (t - ramp / 2) / area;
}

export function busHeading(prepared, distance, wheelbase = 2.65) {
  const rear = samplePolyline(prepared, distance - wheelbase / 2);
  const front = samplePolyline(prepared, distance + wheelbase / 2);
  if (!rear || !front) return 0;
  if (Math.hypot(front.x - rear.x, front.z - rear.z) < 1e-6) return front.angle;
  return Math.atan2(front.x - rear.x, front.z - rear.z);
}

export const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function followBus(mesh, vehicle, height, dt = 1 / 60, wheelbase = 2.65) {
  const previous = mesh.userData.motion;
  const reset = !previous || previous.id !== vehicle.id || Math.abs(vehicle.clock - previous.clock) > 2;
  const blend = reset ? 1 : 1 - Math.exp(-10 * Math.max(0, Math.min(dt, .1)));
  const turn = reset ? 0 : angleDifference(vehicle.angle, mesh.rotation.y);
  const angle = reset ? vehicle.angle : mesh.rotation.y + turn * blend;
  const half = wheelbase / 2;
  const dx = Math.sin(angle) * half, dz = Math.cos(angle) * half;
  const frontHeight = height(vehicle.x + dx, vehicle.z + dz);
  const rearHeight = height(vehicle.x - dx, vehicle.z - dz);
  const elevation = (frontHeight + rearHeight) / 2;
  mesh.position.set(vehicle.x, reset ? elevation : mesh.position.y + (elevation - mesh.position.y) * blend, vehicle.z);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = angle;
  const pitch = -Math.atan2(frontHeight - rearHeight, wheelbase);
  mesh.rotation.x += (pitch - mesh.rotation.x) * blend;
  const travel = reset ? 0 : Math.max(0, vehicle.distance - previous.distance);
  const steering = Math.max(-.45, Math.min(.45, turn * 1.7));
  mesh.traverse(node => {
    if (node.name === 'front-steering') node.rotation.y += (steering - node.rotation.y) * blend;
    if (node.name === 'rolling-wheel') node.rotation.x += travel / .24;
  });
  mesh.userData.motion = {id: vehicle.id, clock: vehicle.clock, distance: vehicle.distance};
}
