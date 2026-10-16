import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, Maximize, MousePointer2, Hand } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

// Setup worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  onClick?: (e: React.MouseEvent, pageNumber: number) => void;
  children?: React.ReactNode; // For overlays
}


export default function PDFViewer({ url, onClick, children }: PDFViewerProps) {
  const [isPanningMode, setIsPanningMode] = useState(true);

  // We only render page 1 for architecture plans
  const pageNumber = 1;

  return (
    <div className="flex flex-col h-full bg-gray-900 w-full overflow-hidden relative select-none">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        centerOnInit={true}
        wheel={{ step: 0.1 }} // Smooth mouse wheel zoom
        panning={{ disabled: !isPanningMode }}
        doubleClick={{ disabled: true }} // Disable double click zoom so it doesn't interfere with quick clicks
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 p-2 bg-white rounded-lg shadow-lg z-20">
              <div className="flex items-center border-r pr-4 space-x-2">
                 <button
                  onClick={() => setIsPanningMode(true)}
                  className={`p-2 rounded flex items-center ${isPanningMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
                  title="Verschieben (Pan)"
                >
                  <Hand size={20} />
                </button>
                <button
                  onClick={() => setIsPanningMode(false)}
                  className={`p-2 rounded flex items-center ${!isPanningMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
                  title="Markieren (Klick für Pendenz)"
                >
                  <MousePointer2 size={20} />
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => zoomOut()}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  title="Verkleinern"
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  onClick={() => resetTransform()}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  title="Ansicht zentrieren"
                >
                  <Maximize size={20} />
                </button>
                <button
                  onClick={() => zoomIn()}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  title="Vergrößern"
                >
                  <ZoomIn size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 w-full h-full cursor-default" style={{ cursor: isPanningMode ? 'grab' : 'crosshair' }}>
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                <div
                  className="relative bg-white shadow-2xl"
                  onClick={(e) => {
                    // Only trigger click if we are NOT in panning mode
                    if (!isPanningMode && onClick) {
                      onClick(e, pageNumber);
                    }
                  }}
                  onMouseDown={(e) => {
                     if (isPanningMode) e.currentTarget.style.cursor = 'grabbing';
                  }}
                  onMouseUp={(e) => {
                     if (isPanningMode) e.currentTarget.style.cursor = 'grab';
                  }}
                >
                  <Document
                    file={url}
                    loading={
                      <div className="p-20 flex justify-center items-center w-[800px] h-[600px]">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                      </div>
                    }
                    error={
                      <div className="p-20 text-red-500">Fehler beim Laden des PDF-Dokuments.</div>
                    }
                  >
                    {/* Render standard scale 2 to get a very high res crisp canvas,
                        the user zooms in and out via CSS transform (react-zoom-pan-pinch) */}
                    <Page
                      pageNumber={pageNumber}
                      scale={2}
                      renderAnnotationLayer={false}
                      renderTextLayer={false} // Disable text layer for better performance on large architectural plans
                      className="pdf-page-container"
                    />
                    {children}
                  </Document>
                </div>
              </TransformComponent>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
