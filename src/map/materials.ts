import * as THREE from 'three';
import { theme } from '../theme';

function flat(color: number): THREE.MeshBasicMaterial {
  // Flat layers rely on draw order, not depth, so coplanar layers can't z-fight.
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
}

/** One shared set of materials, so tiles only ever dispose their geometry. */
export function createMaterials() {
  const { colors, buildings } = theme;
  return {
    land: flat(colors.land),
    water: flat(colors.water),
    park: flat(colors.park),
    roadsMajor: flat(colors.roadsMajor),
    roadsMinor: flat(colors.roadsMinor),
    buildings: new THREE.MeshLambertMaterial({
      vertexColors: true,
      // Push faces back slightly so edge lines draw cleanly on top of them.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    edges: new THREE.LineBasicMaterial({
      color: buildings.edgeColor,
      transparent: true,
      opacity: buildings.edgeOpacity,
    }),
    edgesVisible: true,
  };
}

export type MapMaterials = ReturnType<typeof createMaterials>;

export function disposeMaterials(materials: MapMaterials): void {
  for (const value of Object.values(materials)) {
    if (value instanceof THREE.Material) value.dispose();
  }
}
