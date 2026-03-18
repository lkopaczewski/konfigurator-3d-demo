import * as THREE from 'three';

export type MaterialDescriptor = {
  id: string; // material.uuid
  name: string;
};

export type MaterialGroupKey = 'tires' | 'body' | 'glass';

const GROUP_KEYWORDS: Record<MaterialGroupKey, string[]> = {
  // Uwaga: dopasowanie jest oparte o `includes()`, więc zbyt ogólne słowa-klucze
  // (np. `black` czy `car`) potrafią przypadkowo wpadać do innych części modelu.
  tires: ['tire', 'tyre', 'wheel', 'rim', 'rubber', 'zz_wheel'],
  // Dla tego GLB kolor lakieru jest rozbijany na materiały nazwane np. `Color_A07`, `Color_M02`, itp.
  // Dlatego oprócz słów typu `paint` łapiemy też prefiks `color_` i `polar_`.
  body: [
    'body',
    'paint',
    'metal',
    'hood',
    'roof',
    'bumper',
    'fender',
    'panel',
    'gloss',
    'color_',
    'polar_',
  ],
  glass: ['glass', 'window', 'windshield', 'windscreen', 'mirror', 'trans', 'transparent'],
};

type ColorMaterial = THREE.Material & { color?: THREE.Color };

const DEFAULT_KEYWORDS = ['body', 'paint'];

type OpacityMaterial = THREE.Material & {
  opacity?: number;
  transparent?: boolean;
};

function materialSupportsColor(material: unknown): material is ColorMaterial {
  const m = material as ColorMaterial | null;
  return Boolean(m && m.color && typeof m.color.set === 'function');
}

export function collectColorMaterials(root: THREE.Object3D) {
  const materialsById = new Map<string, ColorMaterial>();

  root.traverse((obj) => {
    const maybeMesh = obj as unknown as { isMesh?: boolean; material?: unknown };
    if (!maybeMesh.isMesh) return;
    const material = maybeMesh.material as unknown;
    const materials = Array.isArray(material) ? material : [material];

    for (const m of materials) {
      if (!materialSupportsColor(m)) continue;
      const uuid = (m as THREE.Material).uuid;
      if (!uuid) continue;
      materialsById.set(uuid, m);
    }
  });

  const descriptors: MaterialDescriptor[] = [...materialsById.values()].map((m) => ({
    id: m.uuid,
    name: m.name?.trim() ? m.name : m.uuid,
  }));

  return { descriptors, materialsById };
}

export function applyColorToMaterials(
  materialsById: Map<string, ColorMaterial>,
  selectedIds: Set<string>,
  hex: string,
) {
  const color = new THREE.Color(hex);

  for (const id of selectedIds) {
    const material = materialsById.get(id);
    if (!material?.color) continue;
    material.color.set(color);
    // Niektóre materiały po zmianie koloru wymagają flagi.
    material.needsUpdate = true;
  }
}

export function defaultSelectedMaterialIds(
  descriptors: MaterialDescriptor[],
  keywords: string[] = DEFAULT_KEYWORDS,
) {
  const lowered = descriptors.map((d) => ({
    ...d,
    nameLower: d.name.toLowerCase(),
  }));

  const matched = lowered.filter((d) => keywords.some((k) => d.nameLower.includes(k)));
  const list = matched.length > 0 ? matched : lowered.slice(0, Math.min(5, lowered.length));

  return new Set(list.map((d) => d.id));
}

export function extractMaterialGroups(
  descriptors: MaterialDescriptor[],
  groupsKeywords: Partial<Record<MaterialGroupKey, string[]>> = GROUP_KEYWORDS,
) {
  const groupKeys = Object.keys(groupsKeywords) as MaterialGroupKey[];
  const nameLowerById = new Map<string, string>();
  for (const d of descriptors) nameLowerById.set(d.id, d.name.toLowerCase());

  const out: Record<MaterialGroupKey, Set<string>> = {
    tires: new Set(),
    body: new Set(),
    glass: new Set(),
  };

  for (const key of groupKeys) {
    const kws = (groupsKeywords[key] ?? []).map((k) => k.toLowerCase());
    for (const d of descriptors) {
      const nameLower = nameLowerById.get(d.id) ?? '';
      if (kws.some((k) => nameLower.includes(k))) out[key].add(d.id);
    }
  }

  return out;
}

export function applyColorMapToMaterials(
  materialsById: Map<string, ColorMaterial>,
  colorByMaterialId: Record<string, string>,
) {
  const colorCache = new Map<string, THREE.Color>();

  const ids = Object.keys(colorByMaterialId);
  for (const id of ids) {
    const material = materialsById.get(id);
    if (!material?.color) continue;

    const hex = colorByMaterialId[id];
    let color = colorCache.get(hex);
    if (!color) {
      color = new THREE.Color(hex);
      colorCache.set(hex, color);
    }

    material.color.set(color);
    material.needsUpdate = true;
  }
}

export function applyOpacityToMaterials(
  materialsById: Map<string, OpacityMaterial>,
  selectedIds: Set<string>,
  opacity: number,
) {
  for (const id of selectedIds) {
    const material = materialsById.get(id);
    if (!material) continue;

    // MeshStandardMaterial obsługuje `opacity`, ale nie jest to część interfejsu bazowego `Material`.
    if (typeof material.opacity === 'number') material.opacity = opacity;
    material.transparent = opacity < 1;
    material.needsUpdate = true;
  }
}

