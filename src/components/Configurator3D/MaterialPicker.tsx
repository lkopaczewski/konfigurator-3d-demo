import React, { useMemo } from 'react';
import type { MaterialDescriptor } from './utils';

type MaterialPickerProps = {
  materials: MaterialDescriptor[];
  selectedMaterialIds: string[];
  onSelectedMaterialIdsChange: (next: string[]) => void;
};

export default function MaterialPicker({
  materials,
  selectedMaterialIds,
  onSelectedMaterialIdsChange,
}: MaterialPickerProps) {
  const selectedSet = useMemo(() => new Set(selectedMaterialIds), [selectedMaterialIds]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedMaterialIdsChange([...next]);
  };

  const selectAll = () => onSelectedMaterialIdsChange(materials.map((m) => m.id));
  const clearAll = () => onSelectedMaterialIdsChange([]);

  return (
    <section className="panelSection">
      <div className="panelHeader">
        <span className="panelStep">Krok 1</span>
        <h2 className="panelTitle">Wybierz części</h2>
      </div>

      <div className="panelActions">
        <button type="button" className="panelBtn" onClick={selectAll} disabled={materials.length === 0}>
          Zaznacz wszystko
        </button>
        <button type="button" className="panelBtn" onClick={clearAll} disabled={materials.length === 0}>
          Wyczyść
        </button>
      </div>

      <div className="materialList" role="group" aria-label="Lista materiałów">
        {materials.length === 0 ? (
          <div className="muted">Wczytywanie materiałów…</div>
        ) : (
          materials.map((m) => (
            <label key={m.id} className="materialItem">
              <input
                type="checkbox"
                checked={selectedSet.has(m.id)}
                onChange={() => toggle(m.id)}
              />
              <span className="materialName" title={m.name}>
                {m.name}
              </span>
            </label>
          ))
        )}
      </div>
    </section>
  );
}

