import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

// Setup worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  onPageChange?: (page: number) => void;
  onClick?: (e: React.MouseEvent, pageNumber: number) => void;
  children?: React.ReactNode; // For overlays
}

export default function PDFViewer({ url, onPageChange, onClick, children }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  function changePage(offset: number) {
    const newPageNumber = pageNumber + offset;
    if (newPageNumber >= 1 && newPageNumber <= numPages) {
      setPageNumber(newPageNumber);
      if (onPageChange) onPageChange(newPageNumber);
    }
  }

  function changeScale(offset: number) {
    setScale(prev => Math.max(0.5, Math.min(3, prev + offset)));
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="flex items-center justify-between p-4 bg-white shadow z-10">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-medium">
            Seite {pageNumber} von {numPages || '--'}
          </span>
          <button
            onClick={() => changePage(1)}
            disabled={pageNumber >= numPages}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => changeScale(-0.2)}
            className="p-2 rounded hover:bg-gray-100"
            title="Verkleinern"
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => changeScale(0.2)}
            className="p-2 rounded hover:bg-gray-100"
            title="Vergrößern"
          >
            <ZoomIn size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex justify-center relative">
        <div className="relative shadow-lg bg-white">
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="p-10 flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
              </div>
            }
            error={
              <div className="p-10 text-red-500">Fehler beim Laden des PDF-Dokuments.</div>
            }
          >
            <div
              className="relative"
              onClick={(e) => onClick && onClick(e, pageNumber)}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderAnnotationLayer={false}
                renderTextLayer={true}
              />
              {children}
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
}
