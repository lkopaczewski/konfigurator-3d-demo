import React from 'react';

type ColorSwatchesProps = {
  colors: string[];
  activeColorHex: string;
  onActiveColorHexChange: (hex: string) => void;
  stepNumberLabel?: string;
  title?: string;
};

export default function ColorSwatches({
  colors,
  activeColorHex,
  onActiveColorHexChange,
  stepNumberLabel = 'Krok',
  title = 'Wybierz kolor',
}: ColorSwatchesProps) {
  return (
    <section className="panelSection">
      <div className="panelHeader">
        <span className="panelStep">{stepNumberLabel}</span>
        <h2 className="panelTitle">{title}</h2>
      </div>

      <div className="swatchGrid" role="radiogroup" aria-label="Wybór koloru">
        {colors.map((hex) => {
          const active = hex.toLowerCase() === activeColorHex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              className={`swatchBtn ${active ? 'swatchBtnActive' : ''}`}
              onClick={() => onActiveColorHexChange(hex)}
              aria-checked={active}
              role="radio"
              title={hex}
            >
              <span className="swatchColor" style={{ background: hex }} />
              <span className="swatchHex">{hex}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

