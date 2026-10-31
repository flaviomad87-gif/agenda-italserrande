import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

// Cache in memoria delle foto gia' scaricate (id -> objectURL)
const blobCache = new Map();

async function loadPhotoUrl(id) {
  if (blobCache.has(id)) return blobCache.get(id);
  const res = await api.get(`/photos/${id}/file`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  blobCache.set(id, url);
  return url;
}

// Riduce la foto (lato max 1600px, JPEG) per caricare veloce anche con poca rete
async function compress(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export default function JobPhotos({ clientId }) {
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [uploading, setUploading] = useState(0);
  const [viewIdx, setViewIdx] = useState(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    api
      .get(`/clients/${clientId}/photos`)
      .then((r) => alive && setPhotos(r.data || []))
      .catch(() => alive && setPhotos([]));
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => {
    photos.forEach((p) => {
      if (urls[p.id]) return;
      loadPhotoUrl(p.id)
        .then((u) => setUrls((prev) => ({ ...prev, [p.id]: u })))
        .catch(() => {});
    });
  }, [photos, urls]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const raw of files) {
      setUploading((n) => n + 1);
      try {
        const file = await compress(raw);
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.post(`/clients/${clientId}/photos`, fd);
        blobCache.set(res.data.id, URL.createObjectURL(file));
        setUrls((prev) => ({ ...prev, [res.data.id]: blobCache.get(res.data.id) }));
        setPhotos((prev) => [...prev, res.data]);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Foto non caricata, riprova");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remove = async (photo) => {
    if (!window.confirm("Eliminare questa foto?")) return;
    try {
      await api.delete(`/photos/${photo.id}`);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setViewIdx(null);
      toast.success("Foto eliminata");
    } catch {
      toast.error("Errore");
    }
  };

  return (
    <div className="space-y-2" data-testid="job-photos-section">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">Foto del luogo</span>
        <div className="flex gap-1.5">
          <PickButton icon={Camera} label="Scatta" onClick={() => cameraRef.current?.click()} testId="job-photos-camera-button" />
          <PickButton icon={ImagePlus} label="Galleria" onClick={() => galleryRef.current?.click()} testId="job-photos-gallery-button" />
        </div>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} data-testid="job-photos-camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} data-testid="job-photos-gallery-input" />

      {photos.length === 0 && !uploading ? (
        <p className="text-xs text-stone-400" data-testid="job-photos-empty">Nessuna foto. Scatta il cancello, il garage o il citofono per ricordarti il posto.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5" data-testid="job-photos-grid">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewIdx(i)}
              className="aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-100 transition-transform active:scale-95"
              data-testid={`job-photo-thumb-${p.id}`}
            >
              {urls[p.id] ? (
                <img src={urls[p.id]} alt="Foto lavoro" className="h-full w-full object-cover" />
              ) : (
                <Loader2 className="m-auto h-4 w-4 animate-spin text-stone-400" />
              )}
            </button>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50" data-testid="job-photo-uploading">
              <Loader2 className="h-5 w-5 animate-spin text-[#4A5D23]" />
            </div>
          ))}
        </div>
      )}

      <PhotoViewer
        photos={photos}
        urls={urls}
        index={viewIdx}
        onIndex={setViewIdx}
        onDelete={remove}
      />
    </div>
  );
}

function PickButton({ icon: Icon, label, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
      data-testid={testId}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function PhotoViewer({ photos, urls, index, onIndex, onDelete }) {
  const photo = index !== null ? photos[index] : null;
  const go = (d) => onIndex((index + d + photos.length) % photos.length);
  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-3xl border-0 bg-black p-2 sm:p-3 [&>button]:hidden" data-testid="job-photo-viewer">
        <DialogTitle className="sr-only">Foto lavoro</DialogTitle>
        {photo && (
          <div className="relative">
            <img src={urls[photo.id]} alt="Foto lavoro" className="mx-auto max-h-[78dvh] w-auto rounded-lg object-contain" data-testid="job-photo-viewer-img" />
            {photos.length > 1 && (
              <>
                <ViewerBtn className="left-1 top-1/2 -translate-y-1/2" onClick={() => go(-1)} testId="job-photo-prev"><ChevronLeft className="h-5 w-5" /></ViewerBtn>
                <ViewerBtn className="right-1 top-1/2 -translate-y-1/2" onClick={() => go(1)} testId="job-photo-next"><ChevronRight className="h-5 w-5" /></ViewerBtn>
              </>
            )}
            <ViewerBtn className="right-1 top-1" onClick={() => onIndex(null)} testId="job-photo-close"><X className="h-5 w-5" /></ViewerBtn>
            <ViewerBtn className="bottom-1 right-1 bg-red-600/90 hover:bg-red-600" onClick={() => onDelete(photo)} testId="job-photo-delete"><Trash2 className="h-5 w-5" /></ViewerBtn>
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white" data-testid="job-photo-counter">{index + 1}/{photos.length}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBtn({ className, onClick, testId, children }) {
  return (
    <button type="button" onClick={onClick} className={`absolute flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 ${className}`} data-testid={testId}>
      {children}
    </button>
  );
}
