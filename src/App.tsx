import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Compass,
  Footprints,
  Globe2,
  Info,
  MapPin,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Waves,
  X,
  Building2,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { CityHandle, CityStatus, Mode, Location } from "./City";
import { destinations, type Destination } from "./destinations";
import { FacadeDialog, type PickedHouse } from "./facade-tool/FacadeDialog";
import type { PhotoFacadeJob } from "./facade-tool/types";
const City = lazy(() => import("./City"));
const initialStatus: CityStatus = {
  terrain: "Loading",
  imagery: "Loading",
  buildings: "Loading",
  vegetation: "Loading",
  structures: "Loading",
  avatar: "Loading",
};
export default function App() {
  const cityRef = useRef<CityHandle>(null);
  const [mode, setMode] = useState<Mode>("intro"),
    [destination, setDestination] = useState<Destination>(destinations[0]);
  const [comparing, setComparing] = useState(false);
  const [originalFacade, setOriginalFacade] = useState(false);
  const [facadeOpen, setFacadeOpen] = useState(false);
  const [facadeJob, setFacadeJob] = useState<PhotoFacadeJob | null>(null);
  const [facadePick, setFacadePick] = useState<PickedHouse | null>(null);
  const [pickError, setPickError] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [pendingFacade, setPendingFacade] = useState<PhotoFacadeJob | null>(null);
  const [pendingVisit, setPendingVisit] = useState<{ label: string; x: number; z: number; heading: number; viewAt?: { x: number; z: number } } | null>(null);
  const [status, setStatus] = useState(initialStatus),
    [location, setLocation] = useState<Location>({
      lon: 8.525,
      lat: 47.3115,
      altitude: 1190,
      heading: 325,
    });
  const [cleanGround, setCleanGround] = useState(true);
  const [run, setRun] = useState(false),
    [walkError, setWalkError] = useState("");
  const [hour, setHour] = useState(14),
    [info, setInfo] = useState(false),
    [places, setPlaces] = useState(false),
    [paused, setPaused] = useState(false),
    [transition, setTransition] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const walkInput = useRef(new Set<string>());
  const ready =
    status.terrain === "Ready" &&
    status.buildings === "Ready" &&
    status.imagery === "Ready" &&
    status.avatar === "Ready";
  const loaded = Object.entries(status).filter(([key, s]) => !["details", "traffic", "population", "cableway"].includes(key) && s === "Ready").length;
  const intro = mode === "intro",
    walking = mode === "walk";
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (comparing) { closeComparison(); return; }
        walkInput.current.clear();
        if (places) setPlaces(false);
        else if (info) setInfo(false);
        else if (facadeOpen) {
          setFacadeOpen(false);
          if (!facadeJob) setFacadePick(null);
        }
        else if (mode !== "intro") setPaused((p) => !p);
      }
    };
    const full = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", full);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", full);
    };
  }, [info, mode, places, facadeOpen, facadeJob, comparing, originalFacade]);
  useEffect(() => {
    if (!info && !paused && !places && !document.querySelector(".modal-backdrop") && !status.fatal) return;
    const dialog = document.querySelector<HTMLElement>(".modal-backdrop .dialog");
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const siblings = Array.from(
      document.querySelector("main")!.children,
    ).filter((el) => !el.classList.contains("modal-backdrop")) as HTMLElement[];
    siblings.forEach((el) => {
      el.inert = true;
    });
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input",
        ),
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => {
      siblings.forEach((el) => {
        el.inert = false;
      });
      dialog.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [info, paused, places, facadeOpen, facadeJob, facadePick, status.fatal]);
  function closeComparison() {
    if (originalFacade && facadeJob) cityRef.current?.applyPhotoFacade(facadeJob, {relocate: false});
    setOriginalFacade(false);
    setComparing(false);
  }
  function travel(d: Destination) {
    setComparing(false); setOriginalFacade(false);
    setDestination(d);
    setPlaces(false);
    setPaused(false);
    setPlaceLabel("");
    setPendingFacade(null);
    cityRef.current?.clearPhotoFacade();
    setFacadeJob(null);
    setFacadePick(null);
    setPickError("");
    setFacadeOpen(false);
  }
  function applyFacade(job: PhotoFacadeJob) {
    setPlaceLabel(job.address.label);
    setFacadeJob(job);
    setFacadeOpen(true);
    setPaused(false);
    if (mode !== "walk") {
      setPendingFacade(job);
      setMode("walk");
      return;
    }
    cityRef.current?.applyPhotoFacade(job);
  }
  useEffect(() => {
    const apply = (event: Event) => {
      const job = (event as CustomEvent<PhotoFacadeJob>).detail;
      if (job?.facade && job.address) applyFacade(job);
    };
    window.addEventListener("city-lab-apply-facade", apply);
    return () => window.removeEventListener("city-lab-apply-facade", apply);
  }, [mode]);
  function changeFacade(job: PhotoFacadeJob) {
    setFacadeJob(job);
    if (mode === "walk" && ready) {
      try {
        cityRef.current?.applyPhotoFacade(job, { relocate: false });
      } catch (error) {
        setWalkError(error instanceof Error ? error.message : "The façade could not be applied.");
      }
    }
  }
  function visitHouse(place: PickedHouse, viewAt?: { x: number; z: number }) {
    setFacadePick(place);
    setPlaceLabel(place.label);
    setPaused(false);
    if (mode !== "walk") {
      setPendingVisit({ ...place, viewAt });
      setMode("walk");
      return;
    }
    try {
      cityRef.current?.visitAddress(place.x, place.z, place.heading, { viewAt });
    } catch (error) {
      setWalkError(error instanceof Error ? error.message : "No clear arrival point is available here.");
    }
  }
  useEffect(() => {
    if (!pendingFacade || mode !== "walk" || !ready) return;
    try {
      cityRef.current?.applyPhotoFacade(pendingFacade);
    } catch (error) {
      setWalkError(error instanceof Error ? error.message : "The façade could not be applied.");
    }
    setPendingFacade(null);
  }, [pendingFacade, mode, ready]);
  useEffect(() => {
    if (!pendingVisit || mode !== "walk" || !ready) return;
    try {
      cityRef.current?.visitAddress(pendingVisit.x, pendingVisit.z, pendingVisit.heading, {
        relocate: true,
        viewAt: pendingVisit.viewAt,
      });
    } catch (error) {
      setWalkError(error instanceof Error ? error.message : "No clear arrival point is available here.");
    }
    setPendingVisit(null);
  }, [pendingVisit, mode, ready]);
  function enter() {
    setMode("walk");
    setPaused(false);
  }
  const hold = (key: string) => (
    <button
      key={key}
      aria-label={
        {
          w: "Walk forward",
          a: "Step left",
          s: "Walk backward",
          d: "Step right",
          arrowleft: "Look left",
          arrowright: "Look right",
        }[key]
      }
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        walkInput.current.add(key);
      }}
      onPointerUp={() => walkInput.current.delete(key)}
      onPointerCancel={() => walkInput.current.delete(key)}
      onLostPointerCapture={() => walkInput.current.delete(key)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {key === "w" ? (
        <ArrowUp size={18} />
      ) : key === "s" ? (
        <ArrowDown size={18} />
      ) : key === "a" || key === "arrowleft" ? (
        <ArrowLeft size={18} />
      ) : (
        <ArrowRight size={18} />
      )}
    </button>
  );
  return (
    <main
      className={comparing ? "comparing-facade" : ""}
      data-mode={mode}
      data-lon={location.lon}
      data-lat={location.lat}
      data-altitude={location.altitude}
      data-heading={location.heading}
      data-ready={ready}
      data-facade={placeLabel}
      data-facade-open={facadeOpen ? "1" : ""}
      data-facade-pick={facadePick?.label || ""}
      data-motion={location.motion || "Idle"}
      data-obstacle={location.obstacle || ""}
    >
      <Suspense fallback={<div className="city city-boot" aria-hidden="true" />}>
        <City
          ref={cityRef}
          mode={mode}
          paused={paused || info || places || comparing}
          referenceView={comparing ? facadeJob?.referenceView : undefined}
          pickingHouse={facadeOpen && !facadeJob}
          onHouseHit={(hit) => {
            void fetch(`/api/facade/at?x=${hit.x}&z=${hit.z}`)
              .then((r) => r.json())
              .then((data: { house?: PickedHouse | null }) => {
                if (!data.house) {
                  setPickError("No address on that building.");
                  return;
                }
                setPickError("");
                visitHouse({
                  ...data.house,
                  heading: Number.isFinite(hit.heading) ? hit.heading : data.house.heading,
                }, hit);
              })
              .catch(() => setPickError("Could not read that house."));
          }}
          run={run}
          cleanGround={cleanGround}
          onWalkError={(message) => {
            setWalkError(message);
            setMode("overview");
          }}
          destination={destination}
          hour={hour}
          onStatus={setStatus}
          onLocation={setLocation}
          onTransition={setTransition}
          walkInput={walkInput}
        />
      </Suspense>
      <div className={`vignette ${intro ? "intro-shade" : ""}`} />
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setMode("intro");
            setPlaces(false);
            setPaused(false);
          }}
          aria-label="Return to entrance"
        >
          <span className="brand-mark">
            <Mountain size={24} />
          </span>
          <span>
            ADLISWIL<small>A WORLD TO WANDER</small>
          </span>
        </button>
        <div className="top-right">
          <span className="region">
            <span className="swiss">+</span> ZÜRICH, SWITZERLAND
          </span>
          <button
            className="icon-button"
            aria-label="World information"
            onClick={() => setInfo(true)}
          >
            <Info size={19} />
          </button>
          {!intro && (
            <>
              <button
                className="icon-button"
                aria-label="Paint a house from a photo"
                aria-expanded={facadeOpen}
                onClick={() => {
                  setInfo(false);
                  setPlaces(false);
                  if (!facadeJob) {
                    setFacadePick(null);
                    setPickError("");
                  }
                  setFacadeOpen(true);
                }}
              >
                <Building2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Places to begin"
                aria-expanded={places}
                aria-haspopup="dialog"
                onClick={() => setPlaces(true)}
              >
                <MapPin size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Pause exploration"
                onClick={() => setPaused(true)}
              >
                <Pause size={18} />
              </button>
            </>
          )}
        </div>
      </header>
      {intro ? (
        <>
          <section className="entrance">
            <div className="eyebrow">
              <span /> 47°18′ N · 8°31′ E
            </div>
            <h1>
              A little closer
              <br />
              to <em>the real world.</em>
            </h1>
            <p>
              Between the Sihl and the Swiss hills.
              <br />
              Step into Adliswil. Take the long way home.
            </p>
            <button
              className="enter-button"
              onClick={enter}
              disabled={!ready || !!status.fatal}
            >
              <Footprints size={20} />
              <span>
                {ready ? "Enter the world" : "Bringing the city into view"}
                <small>
                  {ready
                    ? "Explore on foot"
                    : "Loading Swiss terrain & buildings"}
                </small>
              </span>
              {ready ? <ArrowRight size={22} /> : <span className="spinner" />}
            </button>
            <div
              className={`load-rail${ready ? " ready" : ""}`}
              style={{ ["--p" as string]: loaded / 6 }}
              aria-hidden="true"
            >
              <span />
            </div>
            <button className="text-button" onClick={() => setMode("overview")}>
              Or begin above the city <ArrowRight size={15} />
            </button>
          </section>
          <div className="intro-bottom">
            <span className="intro-note">
              <span className={ready ? "live-dot" : "live-dot loading"} />
              {ready
                ? "REAL GEOGRAPHY. YOUR OWN PACE."
                : `ASSEMBLING THE WORLD · ${loaded}/6 LAYERS`}
            </span>
            <div className="place-caption">
              <span>01 / THE SIHL VALLEY</span>
              <p>A town held between river and ridge.</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="view-switch" aria-label="Exploration mode">
            <button
              onClick={() => setMode("walk")}
              disabled={!ready}
              aria-pressed={walking}
            >
              <Footprints size={16} /> On foot
            </button>
            <button onClick={() => setMode("overview")} aria-pressed={!walking}>
              <Globe2 size={16} /> From above
            </button>
          </div>
          <aside className="right-controls">
            <div className="compass" title="Camera heading">
              <span>N</span>
              <Compass
                size={35}
                style={{ transform: `rotate(${-location.heading}deg)` }}
              />
              <small>{Math.round(location.heading)}°</small>
            </div>
            <button
              className="icon-button"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else
                  void document.documentElement
                    .requestFullscreen()
                    .catch(() => { });
              }}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </aside>
          <section className="location-panel">
            <span className="eyebrow">
              {walking ? "ON FOOT" : "ABOVE THE CITY"}
            </span>
            <h2>{placeLabel || destination.title}</h2>
            <p>
              <MapPin size={13} />
              {location.lat.toFixed(5)}° N &nbsp; {location.lon.toFixed(5)}° E
            </p>
            <small>
              {walking
                ? "Third-person · Explorer character"
                : `${Math.round(location.altitude)} m · ellipsoid height`}
            </small>
          </section>
          <div className="bottom-controls">
            <div className="instructions">
              {walking ? (
                <>
                  <span>
                    <kbd>W</kbd>
                    <kbd>A</kbd>
                    <kbd>S</kbd>
                    <kbd>D</kbd> walk
                  </span>
                  <span>Drag / arrows to orbit</span>
                  <span>
                    <kbd>Shift</kbd> run fast
                  </span>
                </>
              ) : (
                <>
                  <span>Drag to orbit</span>
                  <span>Scroll to zoom</span>
                  <span>Ctrl + drag to tilt</span>
                </>
              )}
              <span>
                <kbd>Esc</kbd> pause
              </span>
            </div>
            <div className="daylight">
              {walking && (
                <button
                  className="ground-toggle"
                  aria-pressed={cleanGround}
                  onClick={() => setCleanGround((v) => !v)}
                >
                  {cleanGround ? "Clean streets" : "Original imagery"}
                </button>
              )}
              <Sun size={17} />
              <label htmlFor="daylight">Time of day</label>
              <input
                id="daylight"
                type="range"
                min="540"
                max="1140"
                step="1"
                value={Math.round(hour * 60)}
                onChange={(e) => setHour(Number(e.target.value) / 60)}
              />
              <output>{String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round(hour * 60) % 60).padStart(2, "0")}</output>
            </div>
          </div>
          {walking && !paused && !info && !places && (
            <div className="walk-pad" aria-label="Walking controls">
              <div>{hold("w")}</div>
              <div>
                {hold("a")}
                {hold("s")}
                {hold("d")}
              </div>
              <div className="look-pad">
                {hold("arrowleft")}
                <span>LOOK</span>
                {hold("arrowright")}
              </div>
            </div>
          )}
          {transition && (
            <div className="travel-status" role="status">
              <span className="spinner" /> Taking you to{" "}
              {destination.title.toLowerCase()}…
            </div>
          )}
          {walking && !transition && (
            <div className="motion-state" aria-live="polite">
              {location.obstacle
                ? `${location.obstacle} · move around it`
                : location.motion === "Run"
                  ? "Running · 8 m/s"
                  : location.motion === "Walk"
                    ? "Walking · 4.6 m/s"
                    : "Ready to explore"}
              <button aria-pressed={run} onClick={() => setRun((v) => !v)}>
                {run ? "Run mode on" : "Run mode"}
              </button>
            </div>
          )}
        </>
      )}
      {comparing && facadeJob && (
        <aside className="reference-comparison" aria-label="Photo comparison">
          <div className="eyebrow">PHOTO REFERENCE</div>
          <h2>{facadeJob.address.label}</h2>
          <img src={facadeJob.photo} alt="User-provided street photograph of Poststrasse 9" />
          <p>Four window rows, a narrow/wide window pair, right-hand balconies and a glazed shopfront. Dimensions and hidden details remain approximate.</p>
          <div className="reference-actions">
            <button aria-pressed={originalFacade} onClick={() => {
              const next = !originalFacade;
              setOriginalFacade(next);
              if (next) cityRef.current?.clearPhotoFacade();
              else cityRef.current?.applyPhotoFacade(facadeJob, {relocate: false});
            }}>{originalFacade ? "Show enhanced 3D" : "Show original 3D"}</button>
            <button onClick={closeComparison}>Back to exploring</button>
          </div>
          <p className="reference-state">{originalFacade ? "Original measured model" : "Photo-enhanced model"} · same camera · world paused</p>
        </aside>
      )}
      {facadeOpen && !comparing && (
        <FacadeDialog
          open={facadeOpen}
          job={facadeJob}
          picked={facadePick}
          pickError={pickError}
          onClose={() => {
            setFacadeOpen(false);
            if (!facadeJob) setFacadePick(null);
          }}
          onApplied={applyFacade}
          onChanged={changeFacade}
          onCompare={() => {setOriginalFacade(false); setComparing(true);}}
          onReset={() => {
            cityRef.current?.clearPhotoFacade();
            setFacadeJob(null);
          }}
          onPickAnother={() => {
            cityRef.current?.clearPhotoFacade();
            setFacadeJob(null);
            setFacadePick(null);
            setPickError("");
          }}
        />
      )}
      {walkError && (
        <div className="error-banner" role="alert">
          {walkError}
          <button onClick={() => setWalkError("")}>Dismiss</button>
        </div>
      )}
      <footer className="credits">
        <a
          href="https://www.swisstopo.admin.ch/en"
          target="_blank"
          rel="noreferrer"
        >
          © swisstopo
        </a>
        <span>·</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        <button onClick={() => setInfo(true)}>World sources</button>
      </footer>
      {!status.fatal &&
        Object.values(status).some((s) => s.includes("navailable")) && (
          <div className="error-banner" role="status">
            Some Swiss map layers are unavailable.{" "}
            <button onClick={() => window.location.reload()}>
              Reload world
            </button>
          </div>
        )}
      {status.fatal && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="error-title"
          >
            <h2 id="error-title">The world needs a moment.</h2>
            <p>{status.fatal}</p>
            <button
              className="enter-button"
              onClick={() => window.location.reload()}
            >
              Reload world <RotateCcw size={18} />
            </button>
          </section>
        </div>
      )}
      {places && !info && !paused && (
        <div className="modal-backdrop">
          <section
            className="dialog places-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="places-title"
          >
            <button
              autoFocus
              className="close-button"
              aria-label="Close places"
              onClick={() => setPlaces(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">SOMEWHERE TO BEGIN</div>
            <h2 id="places-title">Choose a place.</h2>
            <p>A few corners of Adliswil, when you want a starting point.</p>
            <div className="places-list">
              {destinations.map((d, i) => (
                <button
                  key={d.id}
                  className={`place ${destination.id === d.id ? "selected" : ""}`}
                  onClick={() => travel(d)}
                  aria-label={d.title}
                  aria-pressed={destination.id === d.id}
                >
                  <span className="place-number">0{i + 1}</span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>{d.subtitle}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {paused && !info && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <div className="eyebrow">TAKE YOUR TIME</div>
            <h2 id="pause-title">The city can wait.</h2>
            <p>Your next turn is still there.</p>
            <button
              autoFocus
              className="enter-button"
              onClick={() => setPaused(false)}
            >
              <Play size={18} /> Continue exploring <ArrowRight size={18} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPaused(false);
                setMode("intro");
              }}
            >
              Return to entrance
            </button>
          </section>
        </div>
      )}
      {info && (
        <div className="modal-backdrop">
          <section
            className="dialog sources"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sources-title"
          >
            <button
              autoFocus
              className="close-button"
              aria-label="Close world information"
              onClick={() => setInfo(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">REAL GEOGRAPHY · GENERATED DETAIL</div>
            <h2 id="sources-title">Grounded in Adliswil.</h2>
            <p>
              Real terrain and measured building shapes from Switzerland’s
              public geodata, drawn as a local walkable town.
            </p>
            <div className="source-row">
              <Mountain size={20} />
              <div>
                <strong>Swiss terrain</strong>
                <small>swisstopo elevation, local town mesh</small>
              </div>
              <span>{status.terrain}</span>
            </div>
            <div className="source-row">
              <Globe2 size={20} />
              <div>
                <strong>Aerial imagery</strong>
                <small>SWISSIMAGE photography, local cells</small>
              </div>
              <span>{status.imagery}</span>
            </div>
            <div className="source-row">
              <Building2 size={20} />
              <div>
                <strong>Measured shapes + generated façades</strong>
                <small>swissBUILDINGS3D geometry</small>
              </div>
              <span>{status.buildings}</span>
            </div>
            <div className="source-row">
              <Waves size={20} />
              <div>
                <strong>Vegetation</strong>
                <small>Canton Zürich tree inventory</small>
              </div>
              <span>{status.vegetation}</span>
            </div>
            <div className="source-row">
              <Building2 size={20} />
              <div>
                <strong>Landscape structures</strong>
                <small>Mapped bridges, rails & Felsenegg station</small>
              </div>
              <span>{status.structures}</span>
            </div>
            <div className="source-row">
              <Building2 size={20} />
              <div><strong>Street life & landmarks</strong><small>Migros, shops, bins, benches & civic detail</small></div>
              <span>{status.details || "Loading"}</span>
            </div>
            <div className="source-row">
              <Building2 size={20} />
              <div><strong>Buses & S4</strong><small>Saved Swiss timetable · 8 Sep 2026 · follows time of day, not live traffic</small></div>
              <span>{status.traffic || "On foot"}</span>
            </div>
            <div className="source-row">
              <Footprints size={20} />
              <div><strong>People & wildlife</strong><small>Fictional characters and animals on mapped paths, river and woodland</small></div>
              <span>{status.population || "On foot"}</span>
            </div>
            <div className="source-row">
              <Mountain size={20} />
              <div><strong>Felseneggbahn</strong><small>Mapped cable route · illustrative cabin movement</small></div>
              <span>{status.cableway || "Near Felsenegg"}</span>
            </div>
            <p className="source-note">
              Window glass, frames and wall detail are generated, not
              photographic. After about 17:00, some windows pick up a warm
              evening glow. Clean streets covers mapped roads, paved paths and
              surface parking with textured ground and marked crossings. The
              mapped Sihl receives animated water. Gardens,
              unpaved paths and landscape retain their aerial detail. Cars outside
              these mapped areas can still appear. Original imagery restores the
              source photographs. Water appearance, road widths, ground materials and façade patterns are illustrative. The
              Explorer character walks and runs with building, water, slope and
              boundary collision checks. Bridge widths and deck transitions can
              be approximate. Daylight is a June illustration, not live weather.
            </p>
            <p className="source-note">
              Public paths derived from the explorer’s
              OpenStreetMap snapshot, 7 September 2026, under ODbL. Live Swiss
              layers can have different survey dates. An internet connection is
              required.
            </p>
            <a
              className="source-link"
              href="https://docs.geo.admin.ch/visualize-data/3d-tiles.html"
              target="_blank"
              rel="noreferrer"
            >
              Swiss geodata documentation <ArrowRight size={14} />
            </a>
          </section>
        </div>
      )}
    </main>
  );
}
