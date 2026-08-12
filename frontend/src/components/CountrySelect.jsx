import { useState, useRef, useEffect, useMemo } from "react";
import { countries } from "../pages/super-admin/data/countries";

const flagMap = { PK:'🇵🇰', US:'🇺🇸', GB:'🇬🇧', IN:'🇮🇳', AE:'🇦🇪', SA:'🇸🇦', CA:'🇨🇦', AU:'🇦🇺', DE:'🇩🇪', FR:'🇫🇷', TR:'🇹🇷', CN:'🇨🇳', JP:'🇯🇵', BR:'🇧🇷', NG:'🇳🇬', ZA:'🇿🇦', EG:'🇪🇬', KE:'🇰🇪', PH:'🇵🇭', MY:'🇲🇾', BD:'🇧🇩', NP:'🇳🇵', LK:'🇱🇰', SG:'🇸🇬', HK:'🇭🇰', NZ:'🇳🇿', IT:'🇮🇹', ES:'🇪🇸', NL:'🇳🇱', SE:'🇸🇪', CH:'🇨🇭', PL:'🇵🇱', RU:'🇷🇺', KR:'🇰🇷', TH:'🇹🇭', ID:'🇮🇩', VN:'🇻🇳', MX:'🇲🇽', AR:'🇦🇷', CO:'🇨🇴', GH:'🇬🇭', TZ:'🇹🇿', UG:'🇺🇬', ET:'🇪🇹', JO:'🇯🇴', KW:'🇰🇼', BH:'🇧🇭', QA:'🇶🇦', OM:'🇴🇲', LB:'🇱🇧', IQ:'🇮🇶', MA:'🇲🇦', DZ:'🇩🇿', TN:'🇹🇳' };
const flag = (code) => flagMap[code] || '🌍';

export default function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hl, setHl] = useState(0);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = countries.find(c => c.code === value) || countries[0];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q
      ? countries.filter(c => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q))
      : countries;
    if (!q && selected) {
      const idx = base.findIndex(c => c.code === selected.code);
      if (idx > 0) return [base[idx], ...base.filter((_, i) => i !== idx)];
    }
    return base;
  }, [search, selected]);

  useEffect(() => { setHl(0); }, [search, open]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[hl];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [hl, open]);

  // click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
        setPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openDropdown = () => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      // check if there's more space above than below
      const spaceAbove = r.top;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceAbove > spaceBelow && spaceAbove > 240;
      setPos({
        left: r.left,
        width: r.width,
        ...(openUp
          ? { bottom: window.innerHeight - r.top + 4 }
          : { top: r.bottom + 4 }),
      });
    }
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const select = (code) => {
    onChange(code);
    setOpen(false);
    setSearch("");
    setPos(null);
  };

  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); setSearch(""); setPos(null); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHl(i => i < filtered.length - 1 ? i + 1 : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHl(i => i > 0 ? i - 1 : filtered.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[hl]) select(filtered[hl].code); }
  };

  // stop scroll from bubbling to modal
  const onWheel = (e) => {
    const el = listRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 0 && e.deltaY < 0;
    const atBot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
    if (atTop || atBot) e.preventDefault();
    e.stopPropagation();
  };

  if (!pos) {
    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <div onClick={openDropdown} style={triggerStyle(false)}>
          <span style={{ fontSize: 16 }}>{flag(selected.code)}</span>
          <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{selected.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{selected.dial}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    );
  }

  const isUp = !!pos.bottom;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div onClick={openDropdown} style={triggerStyle(true)}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search countries..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={onKey}
          style={inputStyle}
        />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: 'rotate(180deg)', color: 'var(--text-muted)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <div
        ref={listRef}
        onWheel={onWheel}
        style={{
          position: 'fixed',
          left: pos.left,
          width: pos.width,
          ...(isUp ? { bottom: pos.bottom } : { top: pos.top }),
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          maxHeight: 200,
          overflowY: 'auto',
          zIndex: 99999,
          scrollbarWidth: 'thin',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>No matches found</div>
        ) : filtered.map((c, i) => {
          const sel = c.code === value;
          const isHL = i === hl;
          return (
            <div
              key={c.code}
              onClick={() => select(c.code)}
              onMouseEnter={() => setHl(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                color: isHL ? '#fff' : sel ? 'var(--color-primary)' : 'var(--text-dark)',
                background: isHL ? '#444' : sel ? 'var(--color-primary-bg)' : 'transparent',
                fontWeight: sel ? 600 : 400,
                borderRadius: i === 0 ? '10px 10px 0 0' : i === filtered.length - 1 ? '0 0 10px 10px' : 0,
              }}
            >
              <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{flag(c.code)}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
              <span style={{ color: isHL ? '#ccc' : 'var(--text-muted)', fontSize: 12 }}>{c.dial}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function triggerStyle(open) {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 8,
    cursor: 'pointer', height: 40,
    border: open ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
    boxShadow: open ? '0 0 0 3px var(--color-primary-ring)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

const inputStyle = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent',
  fontSize: 13, color: 'var(--text-dark)',
};
