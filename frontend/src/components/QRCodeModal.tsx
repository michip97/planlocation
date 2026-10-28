import { QRCodeSVG } from 'qrcode.react';
import { X, Download } from 'lucide-react';

interface QRCodeModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function QRCodeModal({ url, title, onClose }: QRCodeModalProps) {
  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = `QR_${title.replace(/\s+/g, '_')}.png`;
          downloadLink.href = `${pngFile}`;
          downloadLink.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-800 text-lg truncate">QR-Code: {title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 flex flex-col items-center justify-center">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <QRCodeSVG
              id="qr-code-svg"
              value={url}
              size={200}
              level="H"
              includeMargin={true}
            />
          </div>
          <p className="text-center text-sm text-slate-500 mt-6">
            Scannen Sie diesen Code, um direkt zu {title} zu navigieren.
          </p>
        </div>

        <div className="p-4 border-t bg-slate-50">
          <button
            onClick={downloadQR}
            className="w-full flex justify-center items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <Download size={18} />
            <span>Herunterladen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
