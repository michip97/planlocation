import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, Maximize, MousePointer2, Hand, Loader2 } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ErrorBoundary } from './ErrorBoundary';

// Properly load the worker in a Vite environment. This ensures it's bundled
// locally and cached by vite-plugin-pwa for offline use.
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PDFViewerProps {
  url: string;
  onClick?: (e: React.MouseEvent, pageNumber: number) => void;
  children?: React.ReactNode;
}

export default function PDFViewer({ url, onClick, children }: PDFViewerProps) {
  const [isPanningMode, setIsPanningMode] = useState(true);
  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const [isPageRendered, setIsPageRendered] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pageNumber = 1;
  const isLoading = !isDocumentLoaded || !isPageRendered;

  return (
    <div className="flex flex-col h-full bg-gray-900 w-full overflow-hidden relative select-none">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        centerOnInit={true}
        wheel={{ step: 0.1 }}
        panning={{ disabled: !isPanningMode }}
        doubleClick={{ disabled: true }}
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
                  className="relative bg-white shadow-2xl min-w-[800px] min-h-[600px] flex items-center justify-center"
                  onClick={(e) => {
                    if (!isPanningMode && !isLoading && onClick) {
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
                  {isLoading && !errorMsg && (
                    <div className="absolute inset-0 z-10 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 size={48} className="animate-spin text-blue-500 mb-4" />
                      <div className="text-lg font-medium tracking-wide">
                        {!isDocumentLoaded ? "Plan wird heruntergeladen..." : "Plan wird gerendert..."}
                      </div>
                      <div className="w-64 h-2 bg-slate-200 rounded-full mt-4 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full animate-pulse w-full"></div>
                      </div>
                    </div>
                  )}

                  <ErrorBoundary>
                    <Document
                      file={url}
                      onLoadSuccess={() => setIsDocumentLoaded(true)}
                      onLoadError={(err) => {
                          console.error('PDF Load Error:', err);
                          setErrorMsg(err.message || 'Unbekannter Fehler beim Laden');
                      }}
                      loading={null}
                      error={
                        <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center p-20 text-red-500">
                          <div className="font-bold text-xl mb-2">Fehler beim Laden</div>
                          <div className="text-center">{errorMsg || 'Das PDF-Dokument konnte nicht geladen werden.'}</div>
                        </div>
                      }
                    >
                      <Page
                        pageNumber={pageNumber}
                        scale={2}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        onRenderSuccess={() => setIsPageRendered(true)}
                        onRenderError={(err) => {
                            console.error('PDF Page Render Error:', err);
                            setErrorMsg(err.message || 'Fehler beim Rendern der Seite');
                        }}
                        className={`transition-opacity duration-1000 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                      />
                    </Document>
                  </ErrorBoundary>

                  <div className="absolute inset-0 pointer-events-none z-20">
                    <div className="relative w-full h-full pointer-events-auto">
                      {children}
                    </div>
                  </div>

                </div>
              </TransformComponent>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
