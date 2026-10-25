import * as THREE from 'three';

// IK analítica de dos segmentos (muslo-espinilla, brazo-antebrazo) en espacio mundo.
// Basada en la ley de cosenos; la rodilla/codo se orienta hacia un vector polar.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _t = new THREE.Vector3(), _tmp = new THREE.Vector3(), _axis = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _pole = new THREE.Vector3();

// Aplica una rotación en espacio mundo a un hueso, conservando su jerarquía.
export function rotateBoneWorld(bone, worldRot) {
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_wq);
  // nueva rot. mundo = worldRot * _wq  ->  local = parent^-1 * nueva
  _wq.premultiply(worldRot);
  bone.quaternion.copy(_pq.invert().multiply(_wq));
  bone.updateMatrixWorld(true);
}

export function setBoneWorldQuaternion(bone, worldQ) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(worldQ));
  bone.updateMatrixWorld(true);
}

// a: hueso raíz (muslo), b: hueso medio (espinilla), c: efector (pie). target y pole en mundo.
export function solveTwoBone(a, b, c, target, poleWorld, weight = 1) {
  if (weight <= 0) return;
  a.getWorldPosition(_a);
  b.getWorldPosition(_b);
  c.getWorldPosition(_c);
  _t.copy(_c).lerp(target, weight);
  const lab = _a.distanceTo(_b), lcb = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_a.distanceTo(_t), 0.01, lab + lcb - 0.002);

  // 1) Doblar la articulación media hasta la longitud deseada.
  const ac = _tmp.subVectors(_c, _a);
  const acLen = Math.max(ac.length(), 1e-5);
  const cosAcAb0 = THREE.MathUtils.clamp(ac.dot(_b.clone().sub(_a)) / (acLen * lab), -1, 1);
  const ba = _a.clone().sub(_b), bc = _c.clone().sub(_b);
  const cosBaBc0 = THREE.MathUtils.clamp(ba.dot(bc) / (lab * lcb), -1, 1);
  const ac_ab_0 = Math.acos(cosAcAb0);
  const ba_bc_0 = Math.acos(cosBaBc0);
  const ac_ab_1 = Math.acos(THREE.MathUtils.clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const ba_bc_1 = Math.acos(THREE.MathUtils.clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));

  // Eje de flexión: perpendicular al plano (a, c, polo).
  _pole.copy(poleWorld).sub(_a);
  _axis.crossVectors(ac, _pole);
  if (_axis.lengthSq() < 1e-10) _axis.crossVectors(ac, _b.clone().sub(_a));
  _axis.normalize();

  _q.setFromAxisAngle(_axis, ac_ab_1 - ac_ab_0);
  rotateBoneWorld(a, _q);
  _q.setFromAxisAngle(_axis, ba_bc_1 - ba_bc_0);
  rotateBoneWorld(b, _q);

  // 2) Girar la cadena entera para apuntar al objetivo.
  a.getWorldPosition(_a);
  c.getWorldPosition(_c);
  const ac2 = _c.clone().sub(_a).normalize();
  const at = _t.clone().sub(_a).normalize();
  _q.setFromUnitVectors(ac2, at);
  rotateBoneWorld(a, _q);
}
