import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ColorSwatches from '../../components/Configurator3D/ColorSwatches';
import ModelViewer from '../../components/Configurator3D/ModelViewer';
import type { MaterialDescriptor, MaterialGroupKey } from '../../components/Configurator3D/utils';
import { applyColorMapToMaterials, applyOpacityToMaterials, collectColorMaterials, extractMaterialGroups } from '../../components/Configurator3D/utils';

const MODEL_URL = '/models/mercedes-gls-580.glb';

const PRESET_COLORS: string[] = [
  '#FFFFFF',
  '#111111',
  '#B0B7C3',
  '#7A7A7A',
  '#C62828',
  '#0D47A1',
  '#1565C0',
  '#2E7D32',
  '#F9A825',
  '#6D4C41',
];

export default function Configurator3DPage() {
  const [materials, setMaterials] = useState<MaterialDescriptor[]>([]);
  const [groupColors, setGroupColors] = useState<Record<MaterialGroupKey, string>>({
    tires: PRESET_COLORS[1],
    body: PRESET_COLORS[0],
    glass: PRESET_COLORS[2],
  });
  const [tintedWindowsEnabled, setTintedWindowsEnabled] = useState(true);
  const [isExportingAr, setIsExportingAr] = useState(false);
  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [showArStartPrompt, setShowArStartPrompt] = useState(false);
  const [arViewerOpen, setArViewerOpen] = useState(false);
  const [arViewerSrc, setArViewerSrc] = useState<string>('');
  const [modelViewerReady, setModelViewerReady] = useState(false);
  const [arStatusText, setArStatusText] = useState<string>('');
  const arViewerSrcRef = useRef<string | null>(null);

  const isValidHex = (v: string | null) => Boolean(v && /^#[0-9a-fA-F]{6}$/.test(v));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const body = params.get('body');
    const tires = params.get('tires');
    const glass = params.get('glass');
    const tint = params.get('tint');
    const ar = params.get('ar');

    if (isValidHex(body) || isValidHex(tires) || isValidHex(glass)) {
      setGroupColors((prev) => ({
        ...prev,
        body: isValidHex(body) ? (body as string).toUpperCase() : prev.body,
        tires: isValidHex(tires) ? (tires as string).toUpperCase() : prev.tires,
        glass: isValidHex(glass) ? (glass as string).toUpperCase() : prev.glass,
      }));
    }

    if (tint === '0') setTintedWindowsEnabled(false);
    if (tint === '1') setTintedWindowsEnabled(true);

    if (ar === '1') setShowArStartPrompt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMaterialsExtracted = useCallback((nextMaterials: MaterialDescriptor[]) => {
    setMaterials(nextMaterials);
  }, []);

  const groupIds = useMemo(() => extractMaterialGroups(materials), [materials]);

  const windowTintMaterialIds = useMemo(() => {
    return materials
      .filter((d) => d.name.toLowerCase().includes('tint'))
      .map((d) => d.id);
  }, [materials]);

  const windowTintAvailable = windowTintMaterialIds.length > 0;

  const steps = useMemo(
    () => [
      { key: 'tires' as const, label: 'Opony' },
      { key: 'body' as const, label: 'Karoseria' },
      { key: 'glass' as const, label: 'Szyby' },
    ],
    [],
  );

  const availableSteps = useMemo(
    () => steps.filter((s) => groupIds[s.key].size > 0),
    [steps, groupIds],
  );

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  useEffect(() => {
    setActiveStepIndex(0);
  }, [availableSteps.length]);

  const activeStep = availableSteps[activeStepIndex] ?? null;

  // Budujemy mapę kolorów per materialId, żeby model mógł mieć różne barwy na raz.
  const colorByMaterialId = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of steps) {
      const hex = groupColors[s.key];
      for (const id of groupIds[s.key]) out[id] = hex;
    }
    return out;
  }, [groupColors, groupIds, steps]);

  const setActiveStepColor = (hex: string) => {
    if (!activeStep) return;
    setGroupColors((prev) => ({ ...prev, [activeStep.key]: hex }));
  };

  const openArWithCurrentConfig = useCallback(async () => {
    if (isExportingAr) return;
    if (materials.length === 0) return;

    setIsExportingAr(true);
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(MODEL_URL);

      const { materialsById } = collectColorMaterials(gltf.scene);
      applyColorMapToMaterials(materialsById, colorByMaterialId);

      const tintIds = new Set(windowTintMaterialIds);
      applyOpacityToMaterials(materialsById, tintIds, tintedWindowsEnabled ? 1 : 0);

      const exporter = new GLTFExporter();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          gltf.scene,
          (result) => {
            if (result instanceof ArrayBuffer) resolve(result);
            else if (result && typeof (result as { buffer?: ArrayBuffer }).buffer !== 'undefined') {
              resolve((result as { buffer: ArrayBuffer }).buffer);
            } else {
              reject(new Error('Nie udało się wyeksportować GLB.'));
            }
          },
          (err) => reject(err),
          { binary: true },
        );
      });

      const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
      const blobUrl = URL.createObjectURL(blob);
      // Zamiast otwierać nową kartę (iOS potrafi robić z tego problem),
      // renderujemy model-viewer w modalu na tej samej stronie.
      if (arViewerSrcRef.current) {
        try {
          URL.revokeObjectURL(arViewerSrcRef.current);
        } catch (e) {
          // ignore
        }
      }
      arViewerSrcRef.current = blobUrl;
      setArViewerSrc(blobUrl);
      setModelViewerReady(false);
      setArStatusText('');
      setArViewerOpen(true);
    } catch (err) {
      console.error(err);
      alert('Nie udało się przygotować widoku AR. Sprawdź log w konsoli.');
    } finally {
      setIsExportingAr(false);
    }
  }, [
    isExportingAr,
    materials.length,
    // MODEL_URL jest stałą, ale trzymamy ją w deps dla czytelności.
    MODEL_URL,
    colorByMaterialId,
    windowTintMaterialIds,
    tintedWindowsEnabled,
  ]);

  const startArFromPrompt = useCallback(() => {
    setShowArStartPrompt(false);
    void openArWithCurrentConfig();
  }, [openArWithCurrentConfig]);

  // Lazy-load model-viewer do modala.
  useEffect(() => {
    if (!arViewerOpen) return;

    const existing = document.querySelector('script[data-model-viewer="1"]') as HTMLScriptElement | null;
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js';
    script.async = true;
    script.dataset.modelViewer = '1';
    script.onload = () => {
      // gotowe - model-viewer readiness ustawimy dopiero po załadowaniu modelu (event `load`).
    };
    script.onerror = () => {
      setModelViewerReady(false);
      setArStatusText('Nie udało się załadować model-viewer z CDN.');
    };
    document.head.appendChild(script);
  }, [arViewerOpen]);

  useEffect(() => {
    if (!arViewerOpen) return;

    const el = document.querySelector('model-viewer') as unknown as { addEventListener?: Function } | null;
    if (!el || typeof (el as unknown as { addEventListener: Function }).addEventListener !== 'function') {
      return;
    }

    const onLoad = () => {
      setModelViewerReady(true);
      setArStatusText('');
    };

    const onArStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail ?? {});
      setArStatusText(msg);
    };

    const onArError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail ?? {});
      setArStatusText(`AR error: ${msg}`);
    };

    (el as unknown as { addEventListener: (name: string, cb: (e: Event) => void) => void }).addEventListener('load', onLoad as (e: Event) => void);
    (el as unknown as { addEventListener: (name: string, cb: (e: Event) => void) => void }).addEventListener('ar-status', onArStatus as (e: Event) => void);
    (el as unknown as { addEventListener: (name: string, cb: (e: Event) => void) => void }).addEventListener('ar-error', onArError as (e: Event) => void);

    return () => {
      // brak klasycznych removeEventListener dla custom elementów w tym podejściu
      // (a tak i tak modala jest odpinana przez React przy zamknięciu).
    };
  }, [arViewerOpen, arViewerSrc]);

  useEffect(() => {
    if (!arViewerOpen) return;
    return () => {
      if (arViewerSrcRef.current) {
        try {
          URL.revokeObjectURL(arViewerSrcRef.current);
        } catch (e) {
          // ignore
        }
      }
      arViewerSrcRef.current = null;
      setArViewerSrc('');
      setArStatusText('');
      setModelViewerReady(false);
    };
  }, [arViewerOpen]);

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('body', groupColors.body);
    url.searchParams.set('tires', groupColors.tires);
    url.searchParams.set('glass', groupColors.glass);
    url.searchParams.set('tint', tintedWindowsEnabled ? '1' : '0');
    url.searchParams.set('ar', '1'); // pokaz przycisk startu AR na telefonie
    return url.toString();
  }, [groupColors.body, groupColors.glass, groupColors.tires, tintedWindowsEnabled]);

  const openShareQr = useCallback(async () => {
    const url = buildShareUrl();
    setShareUrl(url);
    setShareQrOpen(true);
  }, [buildShareUrl]);

  useEffect(() => {
    if (!shareQrOpen) return;
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    if (!shareUrl) return;
    void QRCode.toCanvas(canvas, shareUrl, { width: 260 });
  }, [shareQrOpen, shareUrl]);

  return (
    <div className="configuratorRoot">
      <aside className="configuratorPanel">
        <div className="panelTop">
          <div className="panelTitleBlock">
            <div className="panelKicker">Konfigurator 3D</div>
            <h1 className="panelH1">Wybór koloru modelu</h1>
          </div>
          <div className="panelMeta">
            <span className="metaPill">{materials.length} materiałów</span>
            {activeStep ? (
              <span className="metaPill">
                Wybrano: <strong>{activeStep.label}</strong>
              </span>
            ) : (
              <span className="metaPill">Brak dopasowanych materiałów</span>
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="panelBtn"
              onClick={openArWithCurrentConfig}
              disabled={materials.length === 0 || isExportingAr || showArStartPrompt || arViewerOpen}
              title="AR z aktualnymi kolorami (10x mniejsze)"
            >
              {isExportingAr ? 'Przygotowuję AR…' : 'AR (10x mniejsze)'}
            </button>

            <button
              type="button"
              className="panelBtn"
              onClick={openShareQr}
              disabled={materials.length === 0 || isExportingAr || showArStartPrompt || arViewerOpen}
              title="Link+QR do telefonu (ustawi kolory i odpali AR)"
            >
              QR / Link AR
            </button>
          </div>
        </div>

        {!activeStep ? (
          <div className="muted">Wykryłem materiały, ale nie potrafię dopasować ich do opon/karoserii/szyb.</div>
        ) : (
          <>
            <ColorSwatches
              colors={PRESET_COLORS}
              activeColorHex={groupColors[activeStep.key]}
              onActiveColorHexChange={setActiveStepColor}
              stepNumberLabel={`Krok ${activeStepIndex + 1}`}
              title={activeStep.label}
            />

            {windowTintAvailable ? (
              <label className="tintToggleRow" title="Przyciemniane szyby (warstwa WindowsTint)">
                <input
                  type="checkbox"
                  checked={tintedWindowsEnabled}
                  onChange={(e) => setTintedWindowsEnabled(e.target.checked)}
                />
                Przyciemniane szyby
              </label>
            ) : null}

            <div className="stepNav">
              <button
                type="button"
                className="stepNavBtn"
                onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
                disabled={activeStepIndex === 0}
              >
                Wstecz
              </button>

              <div className="stepNavInfo">
                {activeStepIndex + 1} / {availableSteps.length}
              </div>

              <button
                type="button"
                className="stepNavBtn"
                onClick={() => setActiveStepIndex((i) => Math.min(availableSteps.length - 1, i + 1))}
                disabled={activeStepIndex >= availableSteps.length - 1}
              >
                Dalej
              </button>
            </div>

            <div className="stepPills">
              {steps.map((s, idx) => {
                const isAvailable = groupIds[s.key].size > 0;
                const isActive = activeStep?.key === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`stepPill ${isActive ? 'stepPillActive' : ''}`}
                    onClick={() => {
                      const nextIdx = availableSteps.findIndex((x) => x.key === s.key);
                      if (nextIdx >= 0) setActiveStepIndex(nextIdx);
                    }}
                    disabled={!isAvailable}
                    title={!isAvailable ? 'Brak dopasowanych materiałów w modelu' : s.label}
                  >
                    {idx + 1}. {s.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </aside>

      {shareQrOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setShareQrOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: 320,
              background: 'rgba(14, 22, 41, 0.95)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: 16,
              color: 'rgba(230, 238, 252, 0.95)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Udostępnij AR przez QR</div>
              <button type="button" className="panelBtn" onClick={() => setShareQrOpen(false)} style={{ padding: '8px 10px' }}>
                Zamknij
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <canvas ref={qrCanvasRef} />
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8, wordBreak: 'break-word' }}>
              <a href={shareUrl} target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {showArStartPrompt ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 59,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: 380,
              background: 'rgba(14, 22, 41, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: 16,
              color: 'rgba(230, 238, 252, 0.95)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>AR - start</div>
              <button
                type="button"
                className="panelBtn"
                onClick={() => setShowArStartPrompt(false)}
                style={{ padding: '8px 10px' }}
              >
                Zamknij
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
              Kliknij, żeby przygotować aktualnie skonfigurowany samochód do AR (10x mniejsze).
            </div>
            <button
              type="button"
              className="panelBtn"
              onClick={startArFromPrompt}
              disabled={materials.length === 0 || isExportingAr}
              style={{ width: '100%', marginTop: 12 }}
            >
              {isExportingAr ? 'Przygotowuję AR…' : materials.length === 0 ? 'Wczytywanie…' : 'Uruchom AR'}
            </button>
          </div>
        </div>
      ) : null}

      {arViewerOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'rgba(0,0,0,0.95)',
              position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', gap: 10, zIndex: 2 }}>
              <div style={{ color: 'rgba(230,238,252,0.95)', fontSize: 14, fontWeight: 700 }}>
                AR (10x mniejsze)
              </div>
              <button
                type="button"
                className="panelBtn"
                onClick={() => setArViewerOpen(false)}
                style={{ padding: '8px 10px' }}
              >
                Zamknij
              </button>
            </div>

            {arStatusText ? (
              <div
                style={{
                  position: 'absolute',
                  top: 46,
                  left: 12,
                  right: 12,
                  zIndex: 2,
                  color: 'rgba(230,238,252,0.9)',
                  fontSize: 12,
                  textAlign: 'center',
                  padding: '0 8px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {arStatusText}
              </div>
            ) : null}

            {!modelViewerReady ? (
              <div style={{ color: '#fff', padding: 20, marginTop: 60, fontFamily: 'sans-serif' }}>
                Wczytywanie model-viewer...
              </div>
            ) : null}

            <div
              style={{
                position: 'absolute',
                bottom: 18,
                left: 18,
                right: 18,
                zIndex: 3,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: modelViewerReady ? 'auto' : 'none',
              }}
            >
              <button
                type="button"
                className="panelBtn"
                onClick={() => {
                  const el = document.querySelector('model-viewer') as unknown as { activateAR?: () => void } | null;
                  const fn = el?.activateAR;
                  if (typeof fn !== 'function') {
                    setArStatusText('model-viewer: brak metody activateAR');
                    return;
                  }
                  try {
                    fn.call(el);
                  } catch (e) {
                    setArStatusText(`Błąd podczas activateAR: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
                disabled={!modelViewerReady || !arViewerSrc}
                style={{
                  width: 'min(520px, 100%)',
                  padding: '12px 14px',
                  fontSize: 14,
                }}
                title="Wejdź w tryb AR (kamera w telefonie)"
              >
                Wejdź w AR (kamera)
              </button>
            </div>

            {/* model-viewer jest custom elementem; React nie zawsze zna typy, więc korzystamy z braku typów. */}
            {/* eslint-disable-next-line react/no-unknown-property */}
            <model-viewer
              src={arViewerSrc}
              ar
              ar-modes="quick-look"
              ar-scale="0.1"
              camera-controls
              exposure="1"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>
      ) : null}

      <main className="configuratorViewer">
        <ModelViewer
          modelUrl={MODEL_URL}
          colorByMaterialId={colorByMaterialId}
          onMaterialsExtracted={onMaterialsExtracted}
          windowTintEnabled={tintedWindowsEnabled && windowTintAvailable}
          windowTintMaterialIds={windowTintMaterialIds}
        />
      </main>
    </div>
  );
}

