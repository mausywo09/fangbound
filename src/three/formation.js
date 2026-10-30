// Where the six fighters stand and where the camera sits. Landscape screens get a side
// view (teams left and right); tall phone screens look down the arena (your team near,
// the enemy far). Slots go front, middle, back; yaw turns +x (the face) toward the foe
// and a little toward the camera. camera.fit is the half width (metres, at the target)
// that must stay on screen. boss: where a side that fights alone (a raid boss) stands.
export function formation(layout) {
  if (layout === 'portrait') {
    return {
      a: [{ pos: [0, 0, 1.95], yaw: Math.PI / 2 - 0.75 }, { pos: [-1.65, 0, 2.85], yaw: Math.PI / 2 - 0.45 }, { pos: [1.65, 0, 3.45], yaw: Math.PI / 2 - 1.0 }],
      b: [{ pos: [0, 0, -1.95], yaw: -Math.PI / 2 + 0.75 }, { pos: [1.65, 0, -2.85], yaw: -Math.PI / 2 + 0.45 }, { pos: [-1.65, 0, -3.45], yaw: -Math.PI / 2 + 1.0 }],
      boss: { a: { pos: [0, 0, 2.6], yaw: Math.PI / 2 - 0.75 }, b: { pos: [0, 0, -3.1], yaw: -Math.PI / 2 + 0.6 } },
      camera: { pos: [0, 9.6, 12.4], target: [0, 0.5, 0.15], fov: 43, sway: 0.1, fit: 3.1 },
    };
  }
  return {
    a: [{ pos: [-1.6, 0, 0.45], yaw: -0.5 }, { pos: [-2.8, 0, -0.5], yaw: -0.42 }, { pos: [-3.9, 0, 0.55], yaw: -0.55 }],
    b: [{ pos: [1.6, 0, 0.45], yaw: Math.PI + 0.5 }, { pos: [2.8, 0, -0.5], yaw: Math.PI + 0.42 }, { pos: [3.9, 0, 0.55], yaw: Math.PI + 0.55 }],
    boss: { a: { pos: [-2.7, 0, 0], yaw: -0.45 }, b: { pos: [2.9, 0, -0.7], yaw: Math.PI + 0.45 } },
    camera: { pos: [0, 2.5, 11.0], target: [0, 1.15, 0], fov: 30, sway: 0.12, fit: 5.0 },
  };
}

// Widens the camera's field of view until camera.fit shows on a screen of this aspect.
export function fitCamera(cam, aspect) {
  const d = Math.hypot(...cam.pos.map((v, i) => v - cam.target[i]));
  const t = Math.max(Math.tan((cam.fov * Math.PI) / 360), cam.fit / (d * aspect));
  return { ...cam, fov: (360 / Math.PI) * Math.atan(t) };
}
