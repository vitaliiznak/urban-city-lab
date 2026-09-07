import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, KeyRound, Mail, Pencil, RotateCcw, X } from "lucide-react";
import type { FacadeDescription, PhotoFacadeJob } from "./types";
import {
  type FacadeStatus,
  PHOTO_SALES_EMAIL,
  PHOTO_SALES_MAILTO,
  facadePaintLocked,
  fetchFacadeStatus,
  photoUnlocked,
  unlockPhoto,
} from "./status";

export type PickedHouse = { label: string; x: number; z: number; heading: number };

type Props = {
  open: boolean;
  job: PhotoFacadeJob | null;
  picked: PickedHouse | null;
  pickError?: string;
  onClose: () => void;
  onApplied: (job: PhotoFacadeJob) => void;
  onChanged: (job: PhotoFacadeJob) => void;
  onCompare: () => void;
  onReset: () => void;
  onPickAnother: () => void;
  onStatus?: (status: FacadeStatus) => void;
  onUnlocked?: () => void;
  knownStatus?: FacadeStatus | null;
};

async function fileDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The photograph could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function Field({
  id, label, value, onChange, type = "text", min, max, step,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="facade-edit-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function FacadeDialog({
  open, job, picked, pickError, onClose, onApplied, onChanged, onReset, onPickAnother, onCompare, onStatus, onUnlocked, knownStatus,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(job?.photo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<FacadeStatus | null>(knownStatus ?? null);
  const [draft, setDraft] = useState<FacadeDescription | null>(job?.facade ?? null);
  const [unlocked, setUnlocked] = useState(photoUnlocked);
  const onChangedRef = useRef(onChanged);
  const onStatusRef = useRef(onStatus);
  onChangedRef.current = onChanged;
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (knownStatus) setStatus(knownStatus);
  }, [knownStatus]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    if (job) {
      setDraft(job.facade);
      if (job.photo) setPreview(job.photo);
    } else {
      setDraft(null);
    }
    void fetchFacadeStatus().then((next) => {
      setStatus(next);
      onStatusRef.current?.(next);
    });
  }, [open, job]);

  useEffect(() => {
    if (!job || !draft) return;
    const timer = setTimeout(() => {
      if (draft === job.facade) return;
      onChangedRef.current({ ...job, facade: draft });
    }, 120);
    return () => clearTimeout(timer);
  }, [draft, job]);

  if (!open) return null;

  function takeFile(next: File | null) {
    setFile(next);
    if (!next) {
      setPreview("");
      return;
    }
    void fileDataUrl(next).then(setPreview).catch(() => setPreview(""));
  }

  async function submit() {
    if (!picked) {
      setError("Click a house first.");
      return;
    }
    if (!file) {
      setError("Add a street photograph of this house.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const image = await fileDataUrl(file);
      const response = await fetch("/api/facade/from-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: picked.label, heading: picked.heading, image, unlock: photoUnlocked() }),
      });
      const data = await response.json() as PhotoFacadeJob & { error?: string };
      if (!response.ok) throw new Error(data.error || "The façade could not be read.");
      onApplied({
        ...data,
        photo: image,

      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The façade could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function loadExample() {
    setError(""); setBusy(true);
    try {
      const response = await fetch("/reference/poststrasse-9/job.json");
      if (!response.ok) throw new Error("The example could not be loaded.");
      onApplied(await response.json());
    } catch (error) {
      setError(error instanceof Error ? error.message : "The example could not be loaded.");
    } finally { setBusy(false); }
  }

  function patch(partial: Partial<FacadeDescription>) {
    setDraft((current) => current ? { ...current, ...partial } : current);
  }

  if (job && draft) {
    return (
      <aside className="facade-dock" role="dialog" aria-modal="false" aria-labelledby="facade-edit-title">
        <section className="dialog facade-editor">
          <button className="close-button" aria-label="Close façade editor" onClick={onClose}>
            <X size={20} />
          </button>
          <div className="facade-head">
            {preview && <img src={preview} alt="" className="facade-thumb" />}
            <div>
              <div className="eyebrow">PAINTED</div>
              <h2 id="facade-edit-title">{job.address.label}</h2>
              <p className="facade-provider">
                {job.provider === "reviewed-photo" ? "Reviewed against the supplied photograph" : job.provider === "codex-cli"
                  ? "Read by Codex CLI"
                  : job.provider === "api"
                    ? "Read by the vision API"
                    : "Fixture — no model ran"}
              </p>
            </div>
          </div>
          {job.referenceView && <button className="enter-button" onClick={onCompare}><ImagePlus size={18} /><span>Compare photo and 3D<small>Same viewpoint · original / enhanced</small></span></button>}
          {!job.reviewedFaces && <>
          <div className="facade-colors">
            <Field id="wall-color" label="Walls" type="color" value={draft.wallColor} onChange={(value) => patch({ wallColor: value })} />
            <Field id="base-color" label="Ground" type="color" value={draft.baseColor} onChange={(value) => patch({ baseColor: value })} />
            <Field id="roof-color" label="Roof" type="color" value={draft.roofColor} onChange={(value) => patch({ roofColor: value })} />
          </div>
          <Field
            id="base-height"
            label={`Ground ${Math.round(draft.baseHeight * 100)}%`}
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={draft.baseHeight}
            onChange={(value) => patch({ baseHeight: Number(value) })}
          />
          <div className="facade-toggles" role="group" aria-label="Shape">
            <button type="button" aria-pressed={draft.gable} onClick={() => patch({ gable: !draft.gable })}>Gable</button>
            <button type="button" aria-pressed={draft.overhang} onClick={() => patch({ overhang: !draft.overhang })}>Overhang</button>
            <button
              type="button"
              aria-pressed={Boolean(draft.undercroft)}
              onClick={() => patch({
                undercroft: draft.undercroft ? null : { x: 0.4, width: 0.48, height: 0.27, depth: 0.38, pillars: 3 },
                overhang: draft.undercroft ? draft.overhang : true,
              })}
            >
              Undercroft
            </button>
          </div>
          </>}
          <button className="enter-button" onClick={onClose}>
            <Check size={18} />
            <span>
              Done
              <small>Paint stays on the house</small>
            </span>
          </button>
          <button
            className="text-button"
            onClick={() => {
              setFile(null);
              setPreview("");
              setDraft(null);
              onReset();
            }}
            type="button"
          >
            <RotateCcw size={16} />
            New photograph
          </button>
        </section>
      </aside>
    );
  }

  if (!job && status === null) return null;

  if (!job && facadePaintLocked(status, unlocked)) {
    return (
      <div className="modal-backdrop">
        <section className="dialog facade-dialog facade-paywall" role="dialog" aria-modal="true" aria-labelledby="facade-paywall-title">
          <button className="close-button" aria-label="Close façade tool" onClick={onClose}>
            <X size={20} />
          </button>
          <div className="eyebrow">CITY LAB PHOTO · PREMIUM</div>
          <h2 id="facade-paywall-title">
            {status?.hosted ? "A paid add-on." : "Vision is behind a paywall."}
          </h2>
          {status?.hosted ? (
            <>
              <p>
                Walking Adliswil is free. Painting a house from a street photo —
                including the Poststrasse 9 example — needs a City Lab Photo licence.
                Pay, then write to us. We turn it on for your organisation.
              </p>
              <a className="enter-button" href={PHOTO_SALES_MAILTO}>
                <Mail size={18} />
                <span>
                  Request City Lab Photo
                  <small>Email us to pay and get access</small>
                </span>
              </a>
              <a className="text-button" href={PHOTO_SALES_MAILTO}>{PHOTO_SALES_EMAIL}</a>
            </>
          ) : (
            <>
              <p>
                Reading a street photo needs vision. Codex on this machine is free.
                Without it, unlock City Lab Photo on this computer.
              </p>
              <button
                className="enter-button"
                onClick={() => {
                  unlockPhoto();
                  setUnlocked(true);
                  onUnlocked?.();
                }}
              >
                <KeyRound size={18} />
                <span>
                  Unlock on this machine
                  <small>Keeps working after you close the tab</small>
                </span>
              </button>
            </>
          )}
        </section>
      </div>
    );
  }

  if (picked) {
    return (
      <aside className="facade-dock" role="dialog" aria-modal="false" aria-labelledby="facade-title">
        <section className="dialog facade-editor">
          <button className="close-button" aria-label="Close façade tool" onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
          <div className="eyebrow">SELECTED HOUSE</div>
          <h2 id="facade-title">{picked.label}</h2>
          <p>Add a street photo of this house. Walk stays open.</p>
          <label
            className="facade-drop"
            htmlFor="facade-photo"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              takeFile(event.dataTransfer.files[0] || null);
            }}
          >
            <input
              id="facade-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => takeFile(e.target.files?.[0] || null)}
            />
            {preview ? <img src={preview} alt="" className="facade-preview" /> : <ImagePlus size={18} />}
            <span>{file ? file.name : "Drop or choose a photo"}</span>
          </label>
          {error && <p className="facade-error" role="alert">{error}</p>}
          <button className="enter-button" onClick={() => void submit()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Pencil size={18} />}
            <span>
              {busy ? "Reading the photograph" : "Paint this house"}
              <small>{busy ? "This can take a minute" : "Colours wrap every wall"}</small>
            </span>
          </button>
          <button className="text-button" type="button" disabled={busy} onClick={onPickAnother}>
            Pick another house
          </button>
        </section>
      </aside>
    );
  }

  return (
    <aside className="facade-hint" role="status">
      <div>
        <div className="eyebrow">PAINT A HOUSE</div>
        <p>{pickError || "Click a house. We take the address, then you add a photo."}</p>
        {!status?.hosted && (
          <button className="text-button" disabled={busy} onClick={() => void loadExample()}>Try Poststrasse 9 photo example</button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <button className="close-button" aria-label="Cancel house paint" onClick={onClose}>
        <X size={18} />
      </button>
    </aside>
  );
}
