// Small inline editor for the operator-managed imam roster. Not a
// modal — lives inside a Field in the F3 Basics tab. Each row is
// one imam name with a delete button; an empty input at the bottom
// lets the caretaker append new names with Enter or a ➕ tap.
//
// The selection (which imam is "currently on the wall") lives in
// `config.imamName`, which we don't touch here beyond flagging
// whichever row matches. The F5 prayer tracker owns that switch.

import { useState } from 'react';

export default function ImamListEditor({ list, currentName, onChange }) {
  const [newName, setNewName] = useState('');

  const trySubmit = () => {
    const s = newName.trim().slice(0, 120);
    if (!s) return;
    // Dedupe case-insensitively — prevents "الشيخ علي" and "الشيخ علي "
    // (trailing space) from spawning separate rows.
    const exists = list.some((n) => n.trim().toLowerCase() === s.toLowerCase());
    if (exists) { setNewName(''); return; }
    if (list.length >= 40) return; // matches the coerce cap in prayer-times/config
    onChange([...list, s]);
    setNewName('');
  };

  const removeAt = (idx) => {
    const next = list.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="imam-list-editor">
      {list.length === 0 && (
        <div className="settings__hint imam-list-editor__empty">
          لا يوجد أئمة محفوظون بعد. أضف اسماً أدناه — ستظهر قائمة الاختيار في F5 بعد أوّل إدخال.
        </div>
      )}
      {list.length > 0 && (
        <ul className="imam-list-editor__list">
          {list.map((name, i) => {
            const isCurrent = name === currentName;
            return (
              <li key={name + ':' + i} className="imam-list-editor__row">
                <span className={`imam-list-editor__name ${isCurrent ? 'imam-list-editor__name--current' : ''}`}>
                  {name}
                  {isCurrent && <span className="imam-list-editor__badge" aria-label="الإمام الحالي">الحالي</span>}
                </span>
                <button
                  type="button"
                  className="imam-list-editor__remove"
                  aria-label={`حذف ${name}`}
                  onClick={() => removeAt(i)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="imam-list-editor__add">
        <input
          type="text"
          className="settings__input imam-list-editor__input"
          placeholder="أضف إماماً جديداً — اضغط Enter أو ➕"
          maxLength={120}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); trySubmit(); }
          }}
        />
        <button
          type="button"
          className="settings__btn imam-list-editor__add-btn"
          onClick={trySubmit}
          disabled={!newName.trim() || list.length >= 40}
          title={list.length >= 40 ? 'وصلت للحد الأقصى ٤٠ اسماً' : 'إضافة'}
        >
          ➕ إضافة
        </button>
      </div>
    </div>
  );
}
