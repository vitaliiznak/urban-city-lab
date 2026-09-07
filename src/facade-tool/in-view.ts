export function houseIsInFrontView(
  player: { x: number; z: number },
  yaw: number,
  camera: { x: number; z: number },
  look: { x: number; z: number },
  house: { x: number; z: number },
) {
  const dx = house.x - player.x;
  const dz = house.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.35) return true;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const playerDot = (dx * forwardX + dz * forwardZ) / dist;
  if (playerDot < -0.2) return false;

  const lx = look.x - camera.x;
  const lz = look.z - camera.z;
  const lookLen = Math.hypot(lx, lz) || 1;
  const hx = house.x - camera.x;
  const hz = house.z - camera.z;
  const houseLen = Math.hypot(hx, hz) || 1;
  const cameraDot = (lx * hx + lz * hz) / (lookLen * houseLen);
  if (cameraDot < 0.22) return false;
  const playerFromCam = Math.hypot(player.x - camera.x, player.z - camera.z);
  if (houseLen + 0.4 < playerFromCam * 0.45) return false;
  return playerDot > 0.08 || cameraDot > 0.5;
}
