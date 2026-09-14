import { useEffect, useRef, useState } from "react";
import { Building2, Check, ImagePlus, KeyRound, Mail, Pencil, RotateCcw, X } from "lucide-react";
import type { FacadeDescription, PhotoFacadeJob } from "./types";
import { featuredPreparedFacade, preparedFacadeFor } from "./prepared";
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
  onSelectHouse: (house: PickedHouse) => void;
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
  open, job, picked, pickError, onClose, onApplied, onChanged, onReset, onPickAnother, onSelectHouse, onCompare, onStatus, onUnlocked, knownStatus,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<FacadeStatus | null>(knownStatus ?? null);
  const [draft, setDraft] = useState<FacadeDescription | null>(job?.facade ?? null);
  const [unlocked, setUnlocked] = useState(photoUnlocked);
  const prepared = preparedFacadeFor(picked);
  const onChangedRef = useRef(onChanged);
  const onStatusRef = useRef(onStatus);
  onChangedRef.current = onChanged;
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (knownStatus) setStatus(knownStatus);
  }, [knownStatus]);

  useEffect(() => {
    setFile(null);
    setError("");
  }, [picked?.label, picked?.x, picked?.z]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    if (job) {
      setDraft(job.facade);
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
    if (busy) return;
    if (next && !["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setFile(null);
      setError("Choose a JPEG, PNG or WebP photograph.");
      return;
    }
    setFile(next);
    setError("");
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
    if (prepared) {
      try {
        setError("");
        onApplied(structuredClone(prepared));
      } catch (err) {
        setError(err instanceof Error ? err.message : "The prepared façade could not be applied.");
      }
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

  function selectExample(example: PhotoFacadeJob) {
    setError("");
    setFile(null);
    onSelectHouse({ ...example.address });
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
            <div>
              <div className="eyebrow">PAINTED</div>
              <h2 id="facade-edit-title">{job.address.label}</h2>
              <p className="facade-provider">
                {job.provider === "reviewed-photo" ? "Prepared from the reference photo · no AI call" : job.provider === "codex-cli"
                  ? "Read by Codex CLI"
                  : job.provider === "api"
                    ? "Read by the vision API"
                    : "Fixture — no model ran"}
              </p>
              {job.addressBasis === "user-photo" && <p className="facade-provider">Photo-selected building · local address mapping differs</p>}
            </div>
          </div>
          {job.referenceView && <button className="enter-button" onClick={onCompare}><Building2 size={18} /><span>View painted model<small>Original / painted 3D</small></span></button>}
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

  if (!job && status === null && !prepared) return null;

  if (!job && !prepared && facadePaintLocked(status, unlocked)) {
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
                Walking Adliswil is free. Painting a house from a new street photo
                needs a City Lab Photo licence.
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
          <button className="text-button" onClick={() => selectExample(featuredPreparedFacade)}>Try {featuredPreparedFacade.address.label} · instant example</button>
          <p>The prepared example is free and needs no AI service.</p>
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
          <p>{prepared ? "Choose your street photo, then apply the prepared façade." : "Add a street photo of this house. Walk stays open."}</p>
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
              onChange={(e) => {
                takeFile(e.currentTarget.files?.[0] || null);
                e.currentTarget.value = "";
              }}
            />
            <ImagePlus size={18} />
            <span>{file ? file.name : "Drop or choose a photo"}</span>
          </label>
          {error && <p className="facade-error" role="alert">{error}</p>}
          <button className="enter-button" onClick={() => void submit()} disabled={busy || !file}>
            {busy ? <span className="spinner" /> : <Pencil size={18} />}
            <span>
              {busy ? "Reading the photograph" : "Paint this house"}
              <small>{prepared ? "Prepared façade · no AI call" : busy ? "This can take a minute" : "Colours wrap every wall"}</small>
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
        <button className="text-button" disabled={busy} onClick={() => selectExample(featuredPreparedFacade)}>Try {featuredPreparedFacade.address.label} · instant example</button>
        {error && <p role="alert">{error}</p>}
      </div>
      <button className="close-button" aria-label="Cancel house paint" onClick={onClose}>
        <X size={18} />
      </button>
    </aside>
  );
}
