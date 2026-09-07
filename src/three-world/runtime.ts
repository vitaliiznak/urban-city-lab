import * as THREE from "three";
import { createWorld } from "@explorer/world.js";
import { loadRealBuildings } from "@explorer/real-buildings.js";
import { createMunicipalityImagery } from "@explorer/municipality-imagery.js";
import { installFacadeArchitecture } from "@explorer/facade-install.js";
import { addCorridorArchitecture, updateCorridorArchitectureVisibility } from "@explorer/corridor-architecture.js";
import { addCivicArchitecture } from "@explorer/civic-architecture.js";
import { applyOfficialAppearance } from "@explorer/building-appearance.js";
import { createSummit } from "@explorer/summit.js";
import { loadTreeInventory } from "@explorer/tree-inventory.js";
import { addLifeLayer } from "@explorer/life-layer.js";
import { addCivicLayer } from "@explorer/civic-layer.js";
import { addBushof } from "@explorer/bushof.js";
import { addBuses } from "@explorer/buses.js";
import { addS4 } from "@explorer/s4.js";
import { createCharacter, createPopulation } from "@explorer/actors.js";
import { canWalkWorld } from "@explorer/gameplay.js";
import { nearestWalkable } from "@explorer/map-travel.js";
import { terrainCameraHeight } from "@explorer/terrain-camera.js";
import { createBuildingCameraCollision } from "@explorer/building-camera.js";
import { toGeo, toWorld, WORLD_SCALE } from "./geo";
import { addParkingCleanup, collectStreetMeshes } from "./streets";
import {
  collectShadowCasters,
  freezeStaticTransforms,
  optimizeSceneMaterials,
  shadowExtent,
  shouldUseMsaa,
  updateNearbyShadowCasters,
  type ShadowCaster,
} from "./performance";
import { createQualityController, settingsFor, type QualitySettings } from "../quality";
import type { Destination } from "../destinations";
import type { CityStatus, Location, Mode } from "../City";
import type { PhotoFacadeJob } from "../facade-tool/types";
import { extractBuildingWalls, extractMeasuredWalls, extractStreetWall, pickStreetWall } from "../facade-tool/extract-wall";
import { projectElevation } from "../facade-tool/project-elevation";
import { hideExistingFacadeDetails } from "../facade-tool/existing-details";
import { applyPhotoFacade, disposePhotoFacade } from "../facade-tool/apply";
import { colliderAtPoint } from "../facade-tool/match-building";
import { houseIsInFrontView } from "../facade-tool/in-view";
import type { BuildingCollider } from "../facade-tool/types";

const WALK_SPEED = 4.6 * WORLD_SCALE;
const RUN_SPEED = 8 * WORLD_SCALE;
const STREET_COLORS_OK = true;
const FOLLOW_DISTANCE = 16 * WORLD_SCALE;
const DESTINATION_POINTS: Record<string, string> = {
  station: "station",
  cableway: "cable",
  river: "sihl",
};

type HeightFn = (x: number, z: number) => number;

export class ThreeCity {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1200);
  private sun: THREE.DirectionalLight;
  private sky: THREE.HemisphereLight;
  private sunOffset = new THREE.Vector3(-75, 130, 65);
  private world: any;
  private summit: any;
  private imagery: any;
  private life: any;
  private civic: any;
  private buses: any;
  private trains: any;
  private population: any;
  private trees: any;
  private parking: ReturnType<typeof addParkingCleanup> | undefined;
  private streetMeshes: THREE.Mesh[] = [];
  private player: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationClip>();
  private action?: THREE.AnimationAction;
  private clipName = "";
  private pose = "Idle";
  private disposed = false;
  private frame = 0;
  private last = performance.now();
  private lastUi = 0;
  private worldTime = 0;
  private quality = createQualityController();
  private shadowCasters: ShadowCaster[] = [];
  private shadowRadius = 100;
  private lastShadowFocus = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
  private lastSunOffset = new THREE.Vector3();
  private sceneDirty = true;
  private lastDrawnCamera = new THREE.Vector3();
  private lastDrawnLook = new THREE.Vector3();
  private buildingCamera: any;
  private yaw = 0.18;
  private pitch = 0.38;
  private distance = FOLLOW_DISTANCE;
  private walking = false;
  private townReady = false;
  private aerialDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private photoFacade?: THREE.Object3D;
  private restoreExistingFacade?: () => void;
  private referenceView?: PhotoFacadeJob["referenceView"];
  private pickMark?: THREE.Line;
  private pickingHouse = false;
  private housePick?: (hit: { x: number; z: number; heading: number }) => void;
  private pickRay = new THREE.Raycaster();
  private pickNdc = new THREE.Vector2();
  private pickStart = { x: 0, y: 0 };
  private aerialTarget = new THREE.Vector3();
  private look = new THREE.Vector3();
  private cameraGoal = new THREE.Vector3();
  private lookGoal = new THREE.Vector3();
  private cameraOrigin = new THREE.Vector3();
  private cameraDirection = new THREE.Vector3();
  private mode: Mode = "intro";
  private hour = 14;
  private cleanGround = true;
  private paused = false;
  private run = false;
  private obstacle: string | null = null;
  private status: CityStatus = {
    terrain: "Loading",
    imagery: "Loading",
    buildings: "Loading",
    vegetation: "Loading",
    structures: "Loading",
    avatar: "Loading",
  };
  private onResize: () => void;
  private removeListeners: (() => void)[] = [];

  constructor(
    private host: HTMLElement,
    private keys: Set<string>,
    private report: (status: CityStatus) => void,
    private locate: (location: Location) => void,
  ) {
    this.scene.background = new THREE.Color("#bddee0");
    this.scene.fog = new THREE.Fog("#c4dbd5", 180, 750);
    this.sky = new THREE.HemisphereLight("#eaf8ff", "#89985c", 1.9);
    this.scene.add(this.sky);
    this.sun = new THREE.DirectionalLight("#fff1cf", 2.7);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -100;
    this.sun.shadow.camera.right = 100;
    this.sun.shadow.camera.top = 110;
    this.sun.shadow.camera.bottom = -110;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.renderer = new THREE.WebGLRenderer({
      antialias: shouldUseMsaa(),
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D world. WASD to walk, Shift to run, drag or arrows to orbit the character.",
    );
    host.append(this.renderer.domElement);
    this.player = new THREE.Group();
    this.player.visible = false;
    this.scene.add(this.player);
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.bindInput();
    this.resize();
    this.applyQuality(settingsFor("intro", "high"), false);
    this.publish();
  }

  canvas() {
    return this.renderer.domElement;
  }

  async start() {
    try {
      this.world = createWorld(this.scene);
      this.replaceMaterials(this.world.group);
      this.streetMeshes = STREET_COLORS_OK ? collectStreetMeshes(this.world.group) : [];
      this.summit = createSummit(this.scene, this.world);
      this.imagery = createMunicipalityImagery(this.world);
      this.parking = addParkingCleanup(this.heightAt);
      this.scene.add(this.parking.group);
      this.setStreetVisible(this.cleanGround);
      this.note("terrain", "Ready");
      this.note("structures", "Ready");
      this.note("imagery", "Ready");
      this.lookAtIntro(true);
      if (!this.disposed) this.tick();
      void this.imagery.ready.then(() => {
        if (this.disposed) return;
        if (this.imagery.status === "fallback") this.note("imagery", "Some tiles unavailable");
      });
      this.buildingCamera = createBuildingCameraCollision(() => [
        this.world.realBuildings?.group,
        this.world.architectureGroup,
        this.world.corridorGroup,
        this.world.civicGroup,
        this.world.buildingGroup,
        this.world.supplementaryBuildingGroup,
        this.summit?.building,
        this.world.bushof?.group,
        this.photoFacade,
      ]);
      await this.loadAvatar();
      if (this.disposed) return;
      await this.loadTown();
      this.townReady = true;
      this.setHour(this.hour);
      this.setCleanGround(this.cleanGround);
      if (this.mode === "walk" && this.destination) this.goTo(this.destination, this.onWalkError);
    } catch (error) {
      console.error(error);
      this.note("fatal", "The 3D view needs WebGL. Enable hardware acceleration, then reload.");
    }
  }

  private destination: Destination | undefined;
  private onWalkError: ((message: string) => void) | undefined;

  setMode(mode: Mode, destination: Destination, onTransition: (busy: boolean) => void, onWalkError: (message: string) => void) {
    this.onWalkError = onWalkError;
    this.destination = destination;
    this.mode = mode;
    this.quality.setMode(mode);
    this.keys.clear();
    this.walking = false;
    this.player.visible = false;
    this.applyQualityIfNeeded();
    onTransition(mode === "walk");
    if (mode === "intro") {
      this.lookAtIntro(false);
      this.finishView();
      onTransition(false);
      return;
    }
    if (mode === "overview") {
      this.lookAtDestination(destination);
      this.finishView();
      onTransition(false);
      return;
    }
    if (!this.townReady) return;
    this.goTo(destination, onWalkError);
    onTransition(false);
  }

  private finishView() {
    this.camera.position.copy(this.cameraGoal);
    this.look.copy(this.lookGoal);
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
    this.lastDrawnCamera.copy(this.camera.position);
    this.lastDrawnLook.copy(this.look);
    this.sceneDirty = false;
    this.locate(this.location());
    this.markCanvas();
  }

  travel(destination: Destination) {
    this.destination = destination;
    if (this.mode === "overview") this.lookAtDestination(destination);
    if (this.mode === "walk") this.goTo(destination, this.onWalkError);
  }

  applyPhotoFacade(job: PhotoFacadeJob, options: { relocate?: boolean } = {}) {
    const real = this.world?.realBuildings;
    if (!real?.group || !real.manifest) throw Error("Measured buildings are not ready yet.");
    const building = real.manifest.buildings.find((item: { id: string }) => item.id === job.building.id);
    const collider = real.manifest.colliders.find((item: { buildingId: string }) => item.buildingId === job.building.id);
    if (!building || !collider) throw Error("That address is not in the measured building set.");
    const meshes: THREE.Mesh[] = [];
    real.group.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry?.attributes?.position) meshes.push(mesh);
    });
    const observedUpload = job.facade.fidelity === "observed" && !job.reviewedFaces;
    const extract = observedUpload ? extractMeasuredWalls : extractBuildingWalls;
    const extractedWalls = extract(
      meshes as unknown as Parameters<typeof extractBuildingWalls>[0],
      building,
      collider,
      job.address.heading,
    );
    for (const face of job.reviewedFaces ?? []) {
      if (!face.surface) continue;
      const target = face.surface;
      const measured = extractStreetWall(meshes as unknown as Parameters<typeof extractStreetWall>[0], building, collider, Math.atan2(target.normal[0], target.normal[2]), target);
      if (measured.source === "mesh") extractedWalls.push({...measured, id: face.wallId});
    }
    const walls = job.facade.fidelity === "observed" ? extractedWalls.map(wall => {
      const u = (wall.uMin + wall.uMax) / 2;
      const x = wall.normal[2] * u + wall.normal[0] * (wall.plane + 0.2);
      const z = -wall.normal[0] * u + wall.normal[2] * (wall.plane + 0.2);
      return {...wall, visibleBase: Math.max(wall.yMin, this.heightAt(x, z))};
    }) : extractedWalls;
    const mappedFaces = observedUpload ? projectElevation(walls, job.facade, job.address.heading) : job.reviewedFaces;
    const street = pickStreetWall(walls, job.address.heading);
    if (this.photoFacade) {
      this.scene.remove(this.photoFacade);
      disposePhotoFacade(this.photoFacade);
    }
    const streetX = job.address.x + Math.sin(job.address.heading) * 2.2;
    const streetZ = job.address.z + Math.cos(job.address.heading) * 2.2;
    this.restoreExistingFacade?.();
    this.restoreExistingFacade = hideExistingFacadeDetails(this.world.corridorGroup, job.building.id, observedUpload ? job.address.heading : undefined);
    this.photoFacade = applyPhotoFacade(
      walls,
      job.facade,
      meshes as unknown as Parameters<typeof applyPhotoFacade>[2],
      collider,
      street?.id,
      this.heightAt(streetX, streetZ),
      job.wallHint,
      mappedFaces,
      observedUpload,
    );
    this.photoFacade.userData.uploadHeading = observedUpload ? job.address.heading : undefined;
    this.scene.add(this.photoFacade);
    this.sceneDirty = true;
    this.canvas().dataset.photoFacade = job.address.label;
    this.canvas().dataset.photoFacadeProvider = job.provider;
    this.canvas().dataset.photoFacadeWalls = String(walls.length);
    this.canvas().dataset.photoFacadeMapped = JSON.stringify(mappedFaces?.map(f => ({wall:f.wallId, elements:f.facade.elements.length})) ?? []);
    this.canvas().dataset.photoFacadeUndercroft = String(this.photoFacade.userData.undercroft || "");
    if (options.relocate === true) {
      this.standAt(job.address.x, job.address.z, job.address.heading, { lookUp: true });
    } else if (options.relocate !== false && !this.canStayForHouse(job.address.x, job.address.z) && !this.canStayForHouse(collider.x, collider.z)) {
      this.standAt(job.address.x, job.address.z, job.address.heading, { lookUp: true });
    }
  }

  setReferenceView(view?: PhotoFacadeJob["referenceView"]) {
    this.referenceView = view;
    this.resize();
    this.keys.clear();
    if (view) {
      this.player.visible = false;
      this.cameraGoal.fromArray(view.position);
      this.lookGoal.fromArray(view.target);
      this.aerialTarget.copy(this.lookGoal);
      this.finishView();
    } else if (this.walking) {
      this.player.visible = true;
      this.snapWalkCamera();
    }
    this.sceneDirty = true;
    this.canvas().dataset.referenceView = view ? "true" : "";
  }

  clearPhotoFacade() {
    this.restoreExistingFacade?.();
    this.restoreExistingFacade = undefined;
    if (!this.photoFacade) return;
    this.scene.remove(this.photoFacade);
    disposePhotoFacade(this.photoFacade);
    this.photoFacade = undefined;
    this.sceneDirty = true;
    delete this.canvas().dataset.photoFacade;
    delete this.canvas().dataset.photoFacadeProvider;
    delete this.canvas().dataset.photoFacadeWalls;
    delete this.canvas().dataset.photoFacadeUndercroft;
  }

  visitAddress(x: number, z: number, heading: number, options: { relocate?: boolean; viewAt?: { x: number; z: number } } = {}) {
    if (options.relocate === false) return;
    if (options.relocate !== true && this.mode === "walk" && this.walking && options.viewAt) {
      if (this.canStayForHouse(options.viewAt.x, options.viewAt.z)) return;
    }
    if (options.relocate !== true && this.canStayForHouse(x, z)) return;
    this.standAt(x, z, heading);
  }

  private canStayForHouse(x: number, z: number) {
    if (this.mode !== "walk" || !this.walking) return false;
    return houseIsInFrontView(
      this.player.position,
      this.yaw,
      this.camera.position,
      this.look,
      { x, z },
    );
  }

  setHousePick(onPick: ((hit: { x: number; z: number; heading: number }) => void) | null) {
    this.housePick = onPick ?? undefined;
    this.pickingHouse = Boolean(onPick);
    this.canvas().style.cursor = this.pickingHouse ? "crosshair" : "";
    this.canvas().dataset.pickingHouse = this.pickingHouse ? "true" : "";
    if (!onPick) this.clearPickMark();
  }

  private clearPickMark() {
    if (!this.pickMark) return;
    this.scene.remove(this.pickMark);
    this.pickMark.geometry.dispose();
    (this.pickMark.material as THREE.Material).dispose();
    this.pickMark = undefined;
    this.sceneDirty = true;
  }

  private markPickedCollider(collider: { p: number[][]; baseY?: number }) {
    this.clearPickMark();
    const ring = collider.p;
    if (!Array.isArray(ring) || ring.length < 3) return;
    const y = (Number.isFinite(collider.baseY) ? collider.baseY as number : 0) + 0.08;
    const points = ring.map(([x, z]) => new THREE.Vector3(x, y, z));
    points.push(points[0].clone());
    this.pickMark = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xdcebbd, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(this.pickMark);
    this.sceneDirty = true;
  }

  private pickHouseAt(clientX: number, clientY: number) {
    const group = this.world?.realBuildings?.group as THREE.Object3D | undefined;
    const colliders = this.world?.realBuildings?.manifest?.colliders as BuildingCollider[] | undefined;
    if (!group || !colliders || !this.housePick) return;
    const rect = this.canvas().getBoundingClientRect();
    this.pickNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.pickRay.setFromCamera(this.pickNdc, this.camera);
    const hit = this.pickRay.intersectObject(group, true)[0];
    let x = hit?.point.x;
    let z = hit?.point.z;
    if (x == null || z == null) {
      const origin = this.pickRay.ray.origin;
      const direction = this.pickRay.ray.direction;
      for (let t = 1; t < 90; t += 0.55) {
        const sampleX = origin.x + direction.x * t;
        const sampleZ = origin.z + direction.z * t;
        if (colliderAtPoint(colliders, sampleX, sampleZ, 0.2)) {
          x = sampleX;
          z = sampleZ;
          break;
        }
      }
    }
    if (x == null || z == null) return;
    const collider = colliderAtPoint(colliders, x, z);
    if (collider) this.markPickedCollider(collider);
    const normal = hit?.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : undefined;
    const heading = normal && Math.abs(normal.y) < 0.55
      ? Math.atan2(normal.x, normal.z)
      : Number.NaN;
    this.housePick({ x, z, heading });
  }

  private goTo(destination: Destination, onWalkError?: (message: string) => void) {
    try {
      this.walking = true;
      this.player.visible = true;
      this.enter(destination);
      this.snapWalkCamera();
      this.canvas().dataset.enterError = "";
      this.locate(this.location());
      this.markCanvas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No clear arrival point is available here.";
      this.canvas().dataset.enterError = message;
      onWalkError?.(message);
    }
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.sceneDirty = true;
    if (!paused && this.mode === "walk") this.renderer.domElement.focus();
  }

  setRun(run: boolean) {
    this.run = run;
  }

  setHour(hour: number) {
    this.hour = hour;
    this.applyDaylight();
    this.sceneDirty = true;
    this.lastShadowFocus.set(Number.POSITIVE_INFINITY, 0, 0);
  }

  setCleanGround(enabled: boolean) {
    this.cleanGround = enabled;
    this.setStreetVisible(enabled);
    this.sceneDirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    this.removeListeners.forEach((remove) => remove());
    this.imagery?.dispose?.();
    this.life?.dispose?.();
    this.civic?.dispose?.();
    this.buses?.dispose?.();
    this.trains?.dispose?.();
    this.trees?.dispose?.();
    this.parking?.dispose();
    if (this.photoFacade) disposePhotoFacade(this.photoFacade);
    this.clearPickMark();
    this.world?.dispose?.();
    this.mixer?.stopAllAction();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private async loadAvatar() {
    if (this.disposed) return;
    this.scene.remove(this.player);
    this.player = createCharacter({
      skin: "#d9a17b",
      hair: "#54382b",
      shirt: "#d98051",
      pants: "#345362",
      style: "explorer",
      hat: false,
      backpack: true,
    });
    this.player.scale.setScalar(WORLD_SCALE);
    this.player.visible = false;
    this.scene.add(this.player);
    this.note("avatar", "Ready");
  }

  private async loadTown() {
    try {
      await loadRealBuildings(this.scene, this.world);
      if (this.disposed) return;
      try {
        this.world.architectureGroup = installFacadeArchitecture(this.world);
        this.scene.add(this.world.architectureGroup);
      } catch (error) {
        console.warn("Landmark architecture unavailable", error);
      }
      try {
        this.world.corridorGroup = addCorridorArchitecture(this.world);
        this.scene.add(this.world.corridorGroup);
        if (this.photoFacade) {
          this.restoreExistingFacade?.();
          this.restoreExistingFacade = hideExistingFacadeDetails(this.world.corridorGroup, this.photoFacade.userData.facade.buildingId, this.photoFacade.userData.uploadHeading);
        }
      } catch (error) {
        console.warn("Corridor architecture unavailable", error);
      }
      try {
        this.world.civicGroup = addCivicArchitecture(this.world);
        this.scene.add(this.world.civicGroup);
      } catch (error) {
        console.warn("Civic architecture unavailable", error);
      }
      try {
        applyOfficialAppearance(this.world);
      } catch (error) {
        console.warn("Official wall colours unavailable", error);
      }
    } catch (error) {
      console.warn("Official buildings unavailable; keeping mapped fallback", error);
    }
    if (this.disposed) return;
    try {
      this.life = addLifeLayer(this.world);
      this.scene.add(this.life.group);
    } catch (error) {
      console.warn("Street furniture unavailable", error);
    }
    try {
      this.civic = addCivicLayer(this.world);
      this.scene.add(this.civic.group);
    } catch (error) {
      console.warn("Civic dressing unavailable", error);
    }
    try {
      this.world.bushof = addBushof(this.world);
      this.scene.add(this.world.bushof.group);
    } catch (error) {
      console.warn("Bushof unavailable", error);
    }
    this.population = createPopulation(this.scene, this.world, { leisure: true });
    try {
      this.population.placeOccupants?.(this.life);
    } catch (error) {
      console.warn("Seated people unavailable", error);
    }
    this.note("details", this.life || this.world.architectureGroup ? "Ready" : "Some landmarks unavailable");
    this.note("population", "Ready");
    try {
      this.buses = addBuses(this.world);
      this.scene.add(this.buses.group);
    } catch (error) {
      console.warn("Buses unavailable", error);
    }
    try {
      this.trains = addS4(this.world);
      this.scene.add(this.trains.group);
    } catch (error) {
      console.warn("S4 unavailable", error);
    }
    this.note("traffic", this.buses || this.trains ? "Ready" : "Unavailable");
    this.note("cableway", this.world.gondolas?.length ? "Ready" : "Unavailable");
    try {
      this.trees = await loadTreeInventory(this.world);
      if (this.disposed) return;
      this.scene.add(this.trees.group);
      this.world.hideProceduralTrees(this.trees.proceduralDuplicates);
      this.note("vegetation", "Ready");
    } catch (error) {
      console.warn("Tree inventory unavailable; keeping mapped trees", error);
      this.note("vegetation", "Ready");
    }
    this.note("buildings", "Ready");
    this.snapWorldPoints();
    this.applyDaylight();
    this.preparePerformance();
    this.markCanvas();
  }

  private replaceMaterials(root: THREE.Object3D) {
    const replacements = optimizeSceneMaterials(root);
    if (this.world?.windowMaterial && replacements.has(this.world.windowMaterial)) {
      this.world.windowMaterial = replacements.get(this.world.windowMaterial);
    }
  }

  private preparePerformance() {
    this.replaceMaterials(this.scene);
    for (const gondola of this.world?.gondolas || []) gondola.userData.dynamic = true;
    if (this.buses?.group) this.buses.group.userData.dynamic = true;
    if (this.trains?.group) this.trains.group.userData.dynamic = true;
    this.player.userData.dynamic = true;
    freezeStaticTransforms(this.scene);
    this.shadowCasters = collectShadowCasters(this.scene);
    this.sceneDirty = true;
  }

  private snapWorldPoints() {
    for (const point of [this.world?.spawn, ...(this.world?.points || [])]) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      const stand = nearestWalkable(point.x, point.z, this.walkable, 10);
      if (stand) {
        point.x = stand.x;
        point.z = stand.z;
      }
    }
  }

  private heightAt: HeightFn = (x, z) => {
    if (this.summit?.contains(x, z)) return this.summit.getHeight(x, z);
    return this.world?.getHeight?.(x, z) ?? 0;
  };

  private walkable = (x: number, z: number) => {
    if (this.summit?.contains(x, z)) {
      return canWalkWorld(x, z, {
        ...this.world,
        bounds: this.summit.bounds,
        colliders: this.summit.colliders,
        waterPolygons: [],
        bridgePaths: [],
      });
    }
    return canWalkWorld(x, z, this.world);
  };

  private namedPoint(destination: Destination) {
    if (destination.id === "felsenegg") return this.summit?.point;
    if (destination.id === "centre") return this.world?.spawn;
    const id = DESTINATION_POINTS[destination.id];
    return this.world?.points?.find((point: { id: string }) => point.id === id);
  }

  private previewClearance(x: number, z: number, yaw: number) {
    const ground = this.heightAt(x, z);
    const origin = new THREE.Vector3(x, ground + 1.6 * WORLD_SCALE, z);
    const goal = new THREE.Vector3(
      x + Math.sin(yaw) * this.distance,
      ground + 1.8 * WORLD_SCALE + Math.sin(this.pitch) * this.distance,
      z + Math.cos(yaw) * this.distance,
    );
    this.buildingCamera?.constrain?.(origin, goal);
    return origin.distanceTo(goal);
  }

  private walkAhead(x: number, z: number, yaw: number, maxDistance: number) {
    const step = 0.4 * WORLD_SCALE;
    let reached = 0;
    while (reached + step <= maxDistance) {
      const next = reached + step;
      if (!this.walkable(x - Math.sin(yaw) * next, z - Math.cos(yaw) * next)) return reached;
      reached = next;
    }
    return maxDistance;
  }

  private openFacing(x: number, z: number, preferred: number) {
    let best = preferred;
    let bestScore = -1;
    for (const offset of [0, 0.4, -0.4, 0.9, -0.9, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const yaw = preferred + offset;
      const score = this.walkAhead(x, z, yaw, 10 * WORLD_SCALE) * 3 + this.previewClearance(x, z, yaw);
      if (score > bestScore) {
        bestScore = score;
        best = yaw;
      }
    }
    return best;
  }

  private openStand(x: number, z: number, yaw: number) {
    const tries = [
      [x, z],
      [x + Math.sin(yaw) * 3, z + Math.cos(yaw) * 3],
      [x - Math.sin(yaw) * 2.4, z - Math.cos(yaw) * 2.4],
      [x + Math.cos(yaw) * 3, z - Math.sin(yaw) * 3],
      [x - Math.cos(yaw) * 3, z + Math.sin(yaw) * 3],
    ];
    let best = nearestWalkable(x, z, this.walkable, 28);
    let bestScore = -1;
    for (const [tx, tz] of tries) {
      const stand = nearestWalkable(tx, tz, this.walkable, 12);
      if (!stand) continue;
      const facing = this.openFacing(stand.x, stand.z, yaw);
      const score = this.walkAhead(stand.x, stand.z, facing, 10 * WORLD_SCALE) * 3
        + this.previewClearance(stand.x, stand.z, facing);
      if (score > bestScore) {
        bestScore = score;
        best = stand;
      }
    }
    return best;
  }

  private enter(destination: Destination) {
    const named = this.namedPoint(destination);
    const wanted = named ?? toWorld(destination.lon, destination.lat);
    const preferred = Number.isFinite(named?.viewYaw)
      ? named.viewYaw
      : (destination.heading * Math.PI) / 180;
    this.pitch = 0.26;
    this.distance = FOLLOW_DISTANCE;
    const stand = this.openStand(wanted.x, wanted.z, preferred);
    if (!stand) throw Error("No clear arrival point is available here.");
    this.yaw = this.openFacing(stand.x, stand.z, preferred);
    const nudge = this.walkAhead(stand.x, stand.z, this.yaw, 2.4 * WORLD_SCALE);
    stand.x -= Math.sin(this.yaw) * nudge;
    stand.z -= Math.cos(this.yaw) * nudge;
    this.player.position.set(stand.x, this.heightAt(stand.x, stand.z), stand.z);
    this.player.rotation.y = this.yaw + Math.PI;
    this.renderer.domElement.focus();
  }

  private standAt(x: number, z: number, heading: number, options: { lookUp?: boolean } = {}) {
    if (this.mode !== "walk") this.mode = "walk";
    this.walking = true;
    this.player.visible = true;
    this.pitch = options.lookUp ? 0.5 : 0.26;
    this.distance = options.lookUp ? 8.4 * WORLD_SCALE : FOLLOW_DISTANCE;
    const gap = options.lookUp ? 3.1 : 5.4;
    const streetX = x + Math.sin(heading) * gap;
    const streetZ = z + Math.cos(heading) * gap;
    const stand = this.openStand(streetX, streetZ, heading);
    if (!stand) throw Error("No clear arrival point is available here.");
    this.yaw = this.openFacing(stand.x, stand.z, heading);
    this.player.position.set(stand.x, this.heightAt(stand.x, stand.z), stand.z);
    this.player.rotation.y = this.yaw + Math.PI;
    this.snapWalkCamera();
    this.canvas().dataset.enterError = "";
    this.locate(this.location());
    this.markCanvas();
    this.renderer.domElement.focus();
  }

  private snapWalkCamera() {
    this.followCamera(1);
    this.camera.position.copy(this.cameraGoal);
    this.look.copy(this.lookGoal);
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
    this.lastDrawnCamera.copy(this.camera.position);
    this.lastDrawnLook.copy(this.look);
    this.sceneDirty = true;
  }

  private lookAtIntro(immediate: boolean) {
    const centre = toWorld(8.52562, 47.31152);
    const eye = toWorld(8.534, 47.302);
    this.aerialTarget.set(centre.x, this.heightAt(centre.x, centre.z) + 3, centre.z);
    this.cameraGoal.set(eye.x, this.heightAt(eye.x, eye.z) + 90, eye.z);
    this.lookGoal.copy(this.aerialTarget);
    if (immediate) {
      this.camera.position.copy(this.cameraGoal);
      this.look.copy(this.lookGoal);
      this.camera.lookAt(this.look);
    }
  }

  private lookAtDestination(destination: Destination) {
    const stand = toWorld(destination.lon, destination.lat);
    const heading = (destination.heading * Math.PI) / 180;
    const ground = this.heightAt(stand.x, stand.z);
    const lift = Math.max(40, (destination.altitude - 450) * WORLD_SCALE * 0.35);
    this.aerialTarget.set(stand.x, ground + 3, stand.z);
    this.cameraGoal.set(
      stand.x - Math.sin(heading) * lift * 0.9,
      ground + lift,
      stand.z - Math.cos(heading) * lift * 0.65,
    );
    this.lookGoal.copy(this.aerialTarget);
  }

  private tick = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (document.hidden) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.worldTime += this.paused ? 0 : dt;
    this.quality.sample(dt);
    this.applyQualityIfNeeded();
    if (this.mode === "walk" && this.walking) this.step(dt);
    else this.moveAerial(dt);
    this.followCamera(dt);
    if (!this.paused) {
      this.sceneDirty = true;
      try { this.world?.update?.(this.worldTime, dt); } catch {}
      const day = ((this.hour % 24) * 3600 + this.worldTime) % 86400;
      try { this.buses?.update?.(day, this.camera, dt); } catch {}
      try { this.trains?.update?.(day, this.camera, dt); } catch {}
      try { this.population?.update?.(this.worldTime, dt, this.player.position); } catch {}
      try { this.mixer?.update(dt); } catch {}
      try {
        if (this.player.userData?.animate) {
          this.player.userData.animate(this.worldTime, this.pose === "Idle" ? 0 : this.pose === "Run" ? RUN_SPEED : WALK_SPEED);
        }
      } catch {}
    }
    if (
      this.camera.position.distanceToSquared(this.lastDrawnCamera) > 1e-8
      || this.look.distanceToSquared(this.lastDrawnLook) > 1e-8
    ) {
      this.sceneDirty = true;
    }
    if (now - this.lastUi > 160) {
      try { this.imagery?.update?.(this.camera.position); } catch {}
      try {
        if (this.world?.corridorGroup) updateCorridorArchitectureVisibility(this.world.corridorGroup, this.camera.position);
      } catch {}
      try { this.life?.updateVisibility?.(this.camera.position); } catch {}
      try { this.civic?.updateVisibility?.(this.camera.position); } catch {}
      if (this.renderer.shadowMap.enabled && this.shadowCasters.length) {
        const focus = this.player.visible ? this.player.position : this.camera.position;
        updateNearbyShadowCasters(this.shadowCasters, focus, this.shadowRadius);
        this.lastShadowFocus.set(Number.POSITIVE_INFINITY, 0, 0);
      }
      this.locate(this.location());
      this.markCanvas();
      this.lastUi = now;
    }
    if (!this.sceneDirty) return;
    try {
      this.sun.position.copy(this.player.visible ? this.player.position : this.camera.position).add(this.sunOffset);
      this.sun.target.position.copy(this.player.visible ? this.player.position : this.aerialTarget);
      if (this.renderer.shadowMap.enabled) {
        const focus = this.player.visible ? this.player.position : this.aerialTarget;
        if (
          focus.distanceToSquared(this.lastShadowFocus) > 0.01
          || this.sunOffset.distanceToSquared(this.lastSunOffset) > 0.01
        ) {
          this.lastShadowFocus.copy(focus);
          this.lastSunOffset.copy(this.sunOffset);
          this.renderer.shadowMap.needsUpdate = true;
        }
      }
      this.renderer.render(this.scene, this.camera);
      this.lastDrawnCamera.copy(this.camera.position);
      this.lastDrawnLook.copy(this.look);
      this.sceneDirty = false;
    } catch {}
  };

  private step(dt: number) {
    if (this.paused) {
      this.pose = "Idle";
      this.play("Idle");
      return;
    }
    if (this.keys.has("arrowleft") || this.keys.has("q")) this.yaw -= dt * 1.7;
    if (this.keys.has("arrowright") || this.keys.has("r")) this.yaw += dt * 1.7;
    if (this.keys.has("arrowup")) this.pitch = Math.max(0.13, this.pitch - dt * 0.7);
    if (this.keys.has("arrowdown")) this.pitch = Math.min(0.95, this.pitch + dt * 0.7);
    const forward = Number(this.keys.has("w")) - Number(this.keys.has("s"));
    const side = Number(this.keys.has("d")) - Number(this.keys.has("a"));
    const magnitude = Math.hypot(forward, side);
    let speed = 0;
    this.obstacle = null;
    if (magnitude > 0.05) {
      const nx = forward / magnitude,
        nz = side / magnitude;
      speed = this.keys.has("shift") || this.run ? RUN_SPEED : WALK_SPEED;
      const dx = (-Math.sin(this.yaw) * nx + Math.cos(this.yaw) * nz) * speed * dt;
      const dz = (-Math.cos(this.yaw) * nx - Math.sin(this.yaw) * nz) * speed * dt;
      const x = this.player.position.x,
        z = this.player.position.z;
      if (this.walkable(x + dx, z + dz)) {
        this.player.position.x += dx;
        this.player.position.z += dz;
      } else {
        if (this.walkable(x + dx, z)) this.player.position.x += dx;
        if (this.walkable(this.player.position.x, z + dz)) this.player.position.z += dz;
        else this.obstacle = "Building";
      }
      if (Math.hypot(this.player.position.x - x, this.player.position.z - z) < 0.0001) {
        speed = 0;
        if (!this.obstacle) this.obstacle = "Steep ground";
      } else {
        const angle = Math.atan2(dx, dz);
        const delta = Math.atan2(Math.sin(angle - this.player.rotation.y), Math.cos(angle - this.player.rotation.y));
        this.player.rotation.y += delta * Math.min(1, dt * 13);
      }
      this.player.position.y = this.heightAt(this.player.position.x, this.player.position.z);
    }
    this.pose = speed > RUN_SPEED * 0.7 ? "Run" : speed > 0 ? "Walk" : "Idle";
    this.play(this.pose);
  }

  private moveAerial(dt: number) {
    if (this.mode === "intro" || this.paused) return;
    const pan = this.cameraGoal.distanceTo(this.lookGoal) * dt * 0.35;
    if (this.keys.has("w")) this.nudgeAerial(0, -pan);
    if (this.keys.has("s")) this.nudgeAerial(0, pan);
    if (this.keys.has("a")) this.nudgeAerial(-pan, 0);
    if (this.keys.has("d")) this.nudgeAerial(pan, 0);
  }

  private nudgeAerial(x: number, z: number) {
    this.cameraGoal.x += x;
    this.cameraGoal.z += z;
    this.lookGoal.x += x;
    this.lookGoal.z += z;
    this.aerialTarget.copy(this.lookGoal);
  }

  private followCamera(dt: number) {
    if (this.referenceView) return;
    if (this.mode === "walk" && this.walking) {
      const scale = WORLD_SCALE;
      this.cameraOrigin.set(this.player.position.x, this.player.position.y + 1.6 * scale, this.player.position.z);
      this.cameraGoal.set(
        this.player.position.x + Math.sin(this.yaw) * this.distance,
        this.player.position.y + 1.8 * scale + Math.sin(this.pitch) * this.distance,
        this.player.position.z + Math.cos(this.yaw) * this.distance,
      );
      this.cameraGoal.y = terrainCameraHeight(this.cameraOrigin, this.cameraGoal, this.heightAt);
      this.cameraDirection.copy(this.cameraGoal).sub(this.cameraOrigin);
      let safe = this.cameraDirection.length();
      this.cameraDirection.normalize();
      this.cameraGoal.copy(this.cameraOrigin).addScaledVector(this.cameraDirection, safe);
      this.cameraGoal.y = Math.max(this.cameraGoal.y, this.heightAt(this.cameraGoal.x, this.cameraGoal.z) + 0.35);
      this.lookGoal.set(this.player.position.x, this.player.position.y + 1.35 * scale, this.player.position.z);
    }
    this.camera.position.lerp(this.cameraGoal, 1 - Math.exp(-dt * 5));
    if (this.mode === "walk" && this.walking) {
      this.cameraOrigin.set(this.player.position.x, this.player.position.y + 1.6 * WORLD_SCALE, this.player.position.z);
      this.camera.position.y = terrainCameraHeight(this.cameraOrigin, this.camera.position, this.heightAt);
      this.buildingCamera?.constrain?.(this.cameraOrigin, this.camera.position);
    }
    this.look.lerp(this.lookGoal, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(this.look);
  }

  private play(name: string) {
    if (!this.mixer || this.clipName === name) return;
    const clip = this.clips.get(name.toLowerCase());
    if (!clip) return;
    this.clipName = name;
    this.action?.fadeOut(0.15);
    this.action = this.mixer.clipAction(clip);
    this.action.reset().fadeIn(0.15).play();
  }

  private applyDaylight() {
    const dusk = Math.max(0, Math.min(1, (this.hour - 16) / 3.5));
    this.scene.background = new THREE.Color().lerpColors(new THREE.Color("#bddee0"), new THREE.Color("#ebc6ad"), dusk);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.scene.background);
    this.sun.color.set(dusk > 0.4 ? "#ffc181" : "#fff1cf");
    this.sun.intensity = 2.7 - dusk * 0.6;
    this.sky.intensity = 1.9 - dusk * 0.45;
    this.sunOffset.set(-75 - dusk * 35, 130 - dusk * 75, 65);
    this.life?.setEvening?.(dusk > 0.35);
    this.sceneDirty = true;
  }

  private setStreetVisible(visible: boolean) {
    this.streetMeshes.forEach((mesh) => {
      mesh.visible = visible;
    });
    if (this.parking) this.parking.group.visible = visible;
    this.canvas().dataset.streetSurfaceCells = visible ? String(this.streetMeshes.length > 0 ? 1 : 0) : "0";
    this.canvas().dataset.riverSurface = "1";
  }

  private applyQualityIfNeeded() {
    if (!this.quality.consume()) return;
    this.applyQuality(this.quality.settings(), this.mode === "walk");
  }

  private applyQuality(settings: QualitySettings, walking: boolean) {
    const shadows = settings.shadows && walking;
    const half = shadowExtent(settings.shadowDistance, WORLD_SCALE);
    this.renderer.setPixelRatio(settings.resolutionScale * Math.min(devicePixelRatio, 1.25));
    this.renderer.toneMapping = settings.hdr ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    this.sun.shadow.camera.left = -half;
    this.sun.shadow.camera.right = half;
    this.sun.shadow.camera.top = half * 1.1;
    this.sun.shadow.camera.bottom = -half * 1.1;
    this.sun.shadow.camera.far = Math.max(180, settings.shadowDistance * WORLD_SCALE);
    this.sun.shadow.camera.updateProjectionMatrix();
    this.shadowRadius = half * 1.25;
    this.lastShadowFocus.set(Number.POSITIVE_INFINITY, 0, 0);
    this.renderer.shadowMap.needsUpdate = shadows;
    this.sceneDirty = true;
    this.resize();
  }

  private location(): Location {
    if (this.mode === "walk" && this.walking) {
      const geo = toGeo(this.player.position.x, this.player.position.z);
      return {
        ...geo,
        altitude: this.player.position.y / WORLD_SCALE + 440,
        heading: (((this.yaw * 180) / Math.PI) % 360 + 360) % 360,
        motion: this.pose,
        obstacle: this.obstacle,
      };
    }
    const geo = toGeo(this.camera.position.x, this.camera.position.z);
    return {
      ...geo,
      altitude: this.camera.position.y / WORLD_SCALE + 440,
      heading: (((Math.atan2(this.look.x - this.camera.position.x, this.look.z - this.camera.position.z) * 180) / Math.PI) % 360 + 360) % 360,
    };
  }

  private markCanvas() {
    const canvas = this.canvas();
    canvas.dataset.worldLandmarks = this.world?.architectureGroup ? "true" : "false";
    canvas.dataset.replacedBuildings = this.world?.architectureGroup ? "58" : "0";
    canvas.dataset.worldCells = this.life ? "1" : "0";
    canvas.dataset.pedestrians = String(this.population?.npcs?.filter((n: { group: THREE.Object3D }) => n.group.visible).length || 0);
    canvas.dataset.animals = String(this.population?.animals?.filter((n: { group: THREE.Object3D }) => n.group.visible).length || 0);
    canvas.dataset.buses = String(this.buses?.renderedVehicles?.().length || 0);
    canvas.dataset.trains = String(this.trains?.group?.children?.filter((child: THREE.Object3D) => child.visible).length || 0);
    canvas.dataset.cableway = String(this.world?.gondolas?.length || 0);
    canvas.dataset.trafficTime = String(Math.floor(this.hour * 3600));
    const here = this.location();
    canvas.dataset.loc = `${here.lon.toFixed(5)},${here.lat.toFixed(5)},${Math.round(here.heading)}`;
    canvas.dataset.walk = this.walking ? "1" : "0";
    canvas.dataset.pickingHouse = this.pickingHouse ? "true" : "";
    canvas.dataset.camDist = this.camera.position.distanceTo(this.player.position).toFixed(2);
  }

  private controlKey(event: KeyboardEvent) {
    const code = event.code.toLowerCase();
    if (code === "shiftleft" || code === "shiftright") return "shift";
    if (code.startsWith("key") && code.length === 4) return code.slice(3);
    if (code.startsWith("arrow")) return code;
    return event.key.toLowerCase();
  }

  private bindInput() {
    const canvas = this.canvas();
    const typing = (target: EventTarget | null) =>
      (target instanceof HTMLInputElement && target.type !== "range" && target.type !== "checkbox")
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
    const down = (event: KeyboardEvent) => {
      if (this.paused || typing(event.target)) return;
      const key = this.controlKey(event);
      if (!["w", "a", "s", "d", "q", "r", "arrowleft", "arrowright", "arrowup", "arrowdown", "shift"].includes(key)) return;
      event.preventDefault();
      this.keys.add(key);
    };
    const up = (event: KeyboardEvent) => this.keys.delete(this.controlKey(event));
    const clear = () => this.keys.clear();
    const pointerDown = (event: PointerEvent) => {
      if (this.mode === "intro") return;
      this.aerialDragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.pickStart = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerUp = () => {
      this.aerialDragging = false;
    };
    const click = (event: MouseEvent) => {
      if (!this.pickingHouse || this.mode === "intro" || this.paused) return;
      this.pickHouseAt(event.clientX, event.clientY);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!this.aerialDragging || this.paused) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (this.mode === "walk" && this.walking) {
        this.yaw -= dx * 0.004;
        this.pitch = Math.max(0.13, Math.min(0.95, this.pitch + dy * 0.003));
        return;
      }
      if (event.ctrlKey) {
        this.cameraGoal.y = Math.max(8, this.cameraGoal.y + dy * 0.35);
        return;
      }
      this.nudgeAerial(-dx * 0.12, dy * 0.12);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (this.mode === "walk" && this.walking) {
        this.distance = Math.max(5 * WORLD_SCALE, Math.min(28 * WORLD_SCALE, this.distance + event.deltaY * 0.012 * WORLD_SCALE));
        return;
      }
      this.cameraGoal.y = Math.max(8, this.cameraGoal.y + event.deltaY * 0.08);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    canvas.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("click", click);
    canvas.addEventListener("wheel", wheel, { passive: false });
    this.removeListeners.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("click", click);
    });
  }

  private resize() {
    const width = this.host.clientWidth || innerWidth;
    const height = this.host.clientHeight || innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.sceneDirty = true;
  }

  private note(key: keyof CityStatus, value: string) {
    this.status[key] = value;
    this.publish();
  }

  private publish() {
    if (!this.disposed) this.report({ ...this.status });
  }
}
