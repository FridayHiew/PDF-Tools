import React from 'react';
import { FormFieldMeta } from '../types/pdf.ts';
import { Type, ListFilter, RotateCcw } from 'lucide-react';

interface AcroFormFieldsPanelProps {
  fields: FormFieldMeta[];
  values: Record<string, string | boolean>;
  onChange: (name: string, val: string | boolean) => void;
  onClear: () => void;
}

export const AcroFormFieldsPanel: React.FC<AcroFormFieldsPanelProps> = ({
  fields,
  values,
  onChange,
  onClear,
}) => {
  if (fields.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400 text-xs py-8">
        No interactive form fields found in this PDF.
        <p className="mt-1 text-slate-500">
          Use the <strong>Fill & Sign</strong> tools on the left to click and place text, checkmarks, dates, and signatures anywhere on the document.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {fields.length} Fillable Field{fields.length > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Clear all fields"
        >
          <RotateCcw className="w-3 h-3" /> Clear Fields
        </button>
      </div>

      {/* Fields List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {fields.map((f) => {
          const val = values[f.name] !== undefined ? values[f.name] : f.value;

          if (f.type === 'checkbox') {
            return (
              <label
                key={f.name}
                className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition"
              >
                <input
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={(e) => onChange(f.name, e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block capitalize">
                    {f.name.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="text-[10px] text-slate-400">Checkbox Field</span>
                </div>
              </label>
            );
          }

          if (f.type === 'dropdown' && f.options && f.options.length > 0) {
            return (
              <div key={f.name} className="space-y-1">
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">
                  <span className="flex items-center gap-1">
                    <ListFilter className="w-3 h-3 text-indigo-500" />
                    {f.name.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </label>
                <select
                  value={String(val || '')}
                  onChange={(e) => onChange(f.name, e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
                >
                  {f.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          // Default text field
          return (
            <div key={f.name} className="space-y-1">
              <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">
                <span className="flex items-center gap-1">
                  <Type className="w-3 h-3 text-slate-400" />
                  {f.name.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                {f.readOnly && <span className="text-[10px] text-slate-400">(Read only)</span>}
              </label>
              <input
                type="text"
                disabled={f.readOnly}
                value={String(val || '')}
                onChange={(e) => onChange(f.name, e.target.value)}
                placeholder={`Enter ${f.name.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
