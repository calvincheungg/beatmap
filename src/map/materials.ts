import * as THREE from 'three';
import { theme } from '../theme';

interface HalftoneSpacing {
  value: number;
}

/** Prints dots on a flat layer. Dots are fixed to the ground, so they move with the map. */
function withHalftone(material: THREE.MeshBasicMaterial, spacing: HalftoneSpacing): THREE.MeshBasicMaterial {
  const { halftone } = theme;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHalftoneSpacing = spacing;
    shader.uniforms.uHalftoneColor = { value: new THREE.Color(halftone.dotColor) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundPosition;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundPosition = (modelMatrix * vec4(position, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vGroundPosition;\nuniform float uHalftoneSpacing;\nuniform vec3 uHalftoneColor;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float halftoneDistance = length(fract(vGroundPosition / uHalftoneSpacing) - 0.5);
        float halftoneEdge = fwidth(halftoneDistance);
        float halftoneDot = 1.0 - smoothstep(${halftone.radius.toFixed(3)} - halftoneEdge, ${halftone.radius.toFixed(3)} + halftoneEdge, halftoneDistance);
        diffuseColor.rgb = mix(diffuseColor.rgb, uHalftoneColor, halftoneDot * ${halftone.dotOpacity.toFixed(3)});`,
      );
  };
  material.customProgramCacheKey = () => 'halftone';
  return material;
}

function flat(color: number): THREE.MeshBasicMaterial {
  // Flat layers rely on draw order, not depth, so coplanar layers can't z-fight.
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
}

/** One shared set of materials, so tiles only ever dispose their geometry. */
export function createMaterials() {
  const { colors, buildings } = theme;
  const halftoneSpacing: HalftoneSpacing = { value: 1 };
  return {
    halftoneSpacing,
    land: flat(colors.land),
    water: withHalftone(flat(colors.water), halftoneSpacing),
    park: withHalftone(flat(colors.park), halftoneSpacing),
    roadsHighway: flat(colors.roadsHighway),
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
  };
}

export type MapMaterials = ReturnType<typeof createMaterials>;

/** Keeps the dots a steady size on screen, snapping to powers of two so they don't crawl while zooming. */
export function updateHalftone(materials: MapMaterials, viewHeight: number, screenHeight: number): void {
  const wanted = (viewHeight / screenHeight) * theme.halftone.pixelSpacing;
  materials.halftoneSpacing.value = 2 ** Math.round(Math.log2(wanted));
}

export function disposeMaterials(materials: MapMaterials): void {
  for (const value of Object.values(materials)) {
    if (value instanceof THREE.Material) value.dispose();
  }
}
