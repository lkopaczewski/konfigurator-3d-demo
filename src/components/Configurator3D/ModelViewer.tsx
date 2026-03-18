import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { Bounds, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import type { GLTF } from 'three-stdlib';

import {
  collectColorMaterials,
  applyColorMapToMaterials,
  applyOpacityToMaterials,
  type MaterialDescriptor,
} from './utils';

const TEXTURE_URLS = {
  baseColor: new URL('../../../tekstury/Poliigon_BrickWallReclaimed_8320_BaseColor.jpg', import.meta.url).href,
  normal: new URL('../../../tekstury/Poliigon_BrickWallReclaimed_8320_Normal.png', import.meta.url).href,
  roughness: new URL('../../../tekstury/Poliigon_BrickWallReclaimed_8320_Roughness.jpg', import.meta.url).href,
  metallic: new URL('../../../tekstury/Poliigon_BrickWallReclaimed_8320_Metallic.jpg', import.meta.url).href,
};

type ModelViewerProps = {
  modelUrl: string;
  colorByMaterialId: Record<string, string>;
  onMaterialsExtracted: (materials: MaterialDescriptor[]) => void;
  windowTintEnabled: boolean;
  windowTintMaterialIds: string[];
};

function ModelContent({
  modelUrl,
  colorByMaterialId,
  onMaterialsExtracted,
  windowTintEnabled,
  windowTintMaterialIds,
}: Omit<ModelViewerProps, never>) {
  const gltf = useGLTF(modelUrl) as unknown as GLTF & { scene: THREE.Group };

  const materialsByIdRef = useRef<Map<string, THREE.Material & { color?: THREE.Color }>>(new Map());
  const lastSceneRef = useRef<THREE.Object3D | null>(null);

  const [baseColorMap, normalMap, roughnessMap, metallicMap] = useLoader(TextureLoader, [
    TEXTURE_URLS.baseColor,
    TEXTURE_URLS.normal,
    TEXTURE_URLS.roughness,
    TEXTURE_URLS.metallic,
  ]);

  const floorTransform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const minY = box.min.y;

    const width = Math.max(size.x, 1) * 2.2;
    const depth = Math.max(size.z, 1) * 2.2;

    return {
      x: center.x,
      y: minY - 0.001,
      z: center.z,
      width,
      depth,
    };
  }, [gltf.scene]);

  useEffect(() => {
    if (lastSceneRef.current === gltf.scene) return;
    lastSceneRef.current = gltf.scene;

    const { descriptors, materialsById } = collectColorMaterials(gltf.scene);
    materialsByIdRef.current = materialsById;

    onMaterialsExtracted(descriptors);
  }, [gltf.scene, onMaterialsExtracted]);

  useEffect(() => {
    applyColorMapToMaterials(materialsByIdRef.current, colorByMaterialId);
  }, [colorByMaterialId]);

  useEffect(() => {
    const ids = new Set(windowTintMaterialIds);
    const opacity = windowTintEnabled ? 1 : 0;
    applyOpacityToMaterials(materialsByIdRef.current, ids, opacity);
  }, [windowTintEnabled, windowTintMaterialIds]);

  useEffect(() => {
    // Tekstury podłogi (PBR).
    baseColorMap.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    roughnessMap.colorSpace = THREE.NoColorSpace;
    metallicMap.colorSpace = THREE.NoColorSpace;

    const repeat = 6;
    for (const tex of [baseColorMap, normalMap, roughnessMap, metallicMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
  }, [baseColorMap, normalMap, roughnessMap, metallicMap]);

  return (
    <>
      <mesh position={[floorTransform.x, floorTransform.y, floorTransform.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[floorTransform.width, floorTransform.depth]} />
        <meshStandardMaterial
          map={baseColorMap}
          normalMap={normalMap}
          roughnessMap={roughnessMap}
          metalnessMap={metallicMap}
        />
      </mesh>

      <Bounds fit clip observe margin={1.2}>
        <primitive object={gltf.scene} dispose={null} />
      </Bounds>

      <OrbitControls makeDefault enablePan enableZoom enableRotate />
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 10, 7]} intensity={1} castShadow />
    </>
  );
}

export default function ModelViewer({
  modelUrl,
  colorByMaterialId,
  onMaterialsExtracted,
  windowTintEnabled,
  windowTintMaterialIds,
}: ModelViewerProps) {
  const stableColorByMaterialId = useMemo(() => colorByMaterialId, [colorByMaterialId]);

  return (
    <Canvas
      className="modelCanvas"
      camera={{ position: [0, 1.8, 4.5], fov: 45 }}
      shadows
      dpr={[1, 2]}
    >
      <React.Suspense fallback={null}>
        <ModelContent
          modelUrl={modelUrl}
          colorByMaterialId={stableColorByMaterialId}
          onMaterialsExtracted={onMaterialsExtracted}
          windowTintEnabled={windowTintEnabled}
          windowTintMaterialIds={windowTintMaterialIds}
        />
      </React.Suspense>
    </Canvas>
  );
}

