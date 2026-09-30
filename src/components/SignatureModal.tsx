import React, { useRef, useState, useEffect } from 'react';
import { X, PenTool, Type, Trash2, Check } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSignature: (dataUrl: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSaveSignature,
}) => {
  const [tab, setTab] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState<'font-serif' | 'font-cursive' | 'font-mono'>('font-cursive');
  const [strokeColor, setStrokeColor] = useState('#0f172a');

  // Canvas ref for drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!isOpen || tab !== 'draw') return;

    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle high DPI
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      setHasDrawn(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    lastX.current = clientX - rect.left;
    lastY.current = clientY - rect.top;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastX.current, lastY.current);
    ctx.lineTo(currentX, currentY);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastX.current = currentX;
    lastY.current = currentY;
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      const dataUrl = canvas.toDataURL('image/png');
      onSaveSignature(dataUrl);
      onClose();
    } else {
      if (!typedName.trim()) return;
      // Render typed signature into a temporary canvas to get a clean transparent PNG
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 120;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.fillStyle = strokeColor;
      
      let fontStyle = 'italic 38px "Brush Script MT", "Caveat", "Segoe Script", cursive';
      if (selectedFont === 'font-serif') {
        fontStyle = 'italic 36px "Playfair Display", "Georgia", serif';
      } else if (selectedFont === 'font-mono') {
        fontStyle = 'bold 30px "Courier New", monospace';
      }

      ctx.font = fontStyle;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName.trim(), tempCanvas.width / 2, tempCanvas.height / 2);

      const dataUrl = tempCanvas.toDataURL('image/png');
      onSaveSignature(dataUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Create Signature</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Draw or type your signature to place on forms</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            onClick={() => setTab('draw')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition ${
              tab === 'draw'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" /> Draw Signature
          </button>
          <button
            onClick={() => setTab('type')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition ${
              tab === 'type'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Type className="w-3.5 h-3.5" /> Type Signature
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {tab === 'draw' ? (
            <div className="space-y-3">
              <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 overflow-hidden cursor-crosshair">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-44 touch-none"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 text-xs">
                    <PenTool className="w-5 h-5 mb-1 opacity-50" />
                    <span>Sign your name here with mouse or finger</span>
                  </div>
                )}
                {/* Signature guideline line */}
                <div className="absolute left-6 right-6 bottom-8 border-b border-slate-300 dark:border-slate-700/60 pointer-events-none" />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Color:</span>
                  <div className="flex gap-1.5">
                    {['#0f172a', '#1e3a8a', '#047857'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setStrokeColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition ${
                          strokeColor === c ? 'border-indigo-600 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  onClick={clearCanvas}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Enter Your Full Name:
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="e.g. Johnathan Doe"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Choose Style:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSelectedFont('font-cursive')}
                    className={`p-3 rounded-xl border text-center transition ${
                      selectedFont === 'font-cursive'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xl italic font-serif" style={{ fontFamily: 'Caveat, cursive' }}>
                      Cursive
                    </span>
                  </button>
                  <button
                    onClick={() => setSelectedFont('font-serif')}
                    className={`p-3 rounded-xl border text-center transition ${
                      selectedFont === 'font-serif'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-lg italic font-serif">Formal</span>
                  </button>
                  <button
                    onClick={() => setSelectedFont('font-mono')}
                    className={`p-3 rounded-xl border text-center transition ${
                      selectedFont === 'font-mono'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-base font-mono font-bold">Print</span>
                  </button>
                </div>
              </div>

              {/* Preview card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center min-h-[90px] flex items-center justify-center">
                {typedName.trim() ? (
                  <span
                    className="text-2xl"
                    style={{
                      color: strokeColor,
                      fontFamily:
                        selectedFont === 'font-cursive'
                          ? 'Caveat, cursive'
                          : selectedFont === 'font-serif'
                          ? 'Georgia, serif'
                          : 'monospace',
                      fontStyle: selectedFont === 'font-mono' ? 'normal' : 'italic',
                    }}
                  >
                    {typedName}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Signature preview will appear here</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={tab === 'draw' ? !hasDrawn : !typedName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-xs transition"
          >
            <Check className="w-4 h-4" /> Adopt & Use Signature
          </button>
        </div>
      </div>
    </div>
  );
};
