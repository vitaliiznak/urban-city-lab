import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { type Destination } from "./world";
import { ThreeCity } from "./three-world/runtime";
import type { PhotoFacadeJob } from "./facade-tool/types";

export type Mode = "intro" | "overview" | "walk";
export type CityStatus = {
  terrain: string;
  imagery: string;
  buildings: string;
  vegetation: string;
  structures: string;
  avatar: string;
  details?: string;
  traffic?: string;
  population?: string;
  cableway?: string;
  fatal?: string;
};
export type Location = {
  lon: number;
  lat: number;
  altitude: number;
  heading: number;
  motion?: string;
  obstacle?: string | null;
};
export type HouseHit = { x: number; z: number; heading: number };
export type CityHandle = {
  applyPhotoFacade: (job: PhotoFacadeJob, options?: { relocate?: boolean }) => void;
  clearPhotoFacade: () => void;
  visitAddress: (x: number, z: number, heading: number, options?: { relocate?: boolean; viewAt?: { x: number; z: number } }) => void;
};
type Props = {
  referenceView?: PhotoFacadeJob["referenceView"];
  mode: Mode;
  paused: boolean;
  run: boolean;
  cleanGround: boolean;
  destination: Destination;
  hour: number;
  onStatus: (s: CityStatus) => void;
  onLocation: (s: Location) => void;
  onTransition: (v: boolean) => void;
  onWalkError: (s: string) => void;
  walkInput: React.RefObject<Set<string>>;
  pickingHouse?: boolean;
  onHouseHit?: (hit: HouseHit) => void;
};

const City = forwardRef<CityHandle, Props>(function City(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const city = useRef<ThreeCity | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => ({
    applyPhotoFacade(job, options) {
      city.current?.applyPhotoFacade(job, options);
    },
    clearPhotoFacade() {
      city.current?.clearPhotoFacade();
    },
    visitAddress(x, z, heading, options) {
      city.current?.visitAddress(x, z, heading, options);
    },
  }));

  useEffect(() => {
    const keys = latest.current.walkInput.current;
    const world = new ThreeCity(
      host.current!,
      keys,
      (status) => latest.current.onStatus(status),
      (location) => latest.current.onLocation(location),
    );
    city.current = world;
    void world.start().then(() => {
      if (city.current !== world) return;
      const props = latest.current;
      world.setMode(props.mode, props.destination, props.onTransition, props.onWalkError);
      world.setPaused(props.paused);
      world.setReferenceView(props.referenceView);
      world.setRun(props.run);
      world.setHour(props.hour);
      world.setCleanGround(props.cleanGround);
    });
    return () => {
      world.dispose();
      city.current = null;
    };
  }, []);

  useEffect(() => {
    const world = city.current;
    if (!world) return;
    world.setMode(
      props.mode,
      props.destination,
      latest.current.onTransition,
      (message) => {
        latest.current.onWalkError(message);
      },
    );
  }, [props.mode]);

  useEffect(() => {
    city.current?.travel(props.destination);
  }, [props.destination.id]);

  useEffect(() => {
    city.current?.setPaused(props.paused);
  }, [props.paused]);

  useEffect(() => {
    city.current?.setReferenceView(props.referenceView);
  }, [props.referenceView]);

  useEffect(() => {
    city.current?.setRun(props.run);
  }, [props.run]);

  useEffect(() => {
    city.current?.setHour(props.hour);
  }, [props.hour]);

  useEffect(() => {
    city.current?.setCleanGround(props.cleanGround);
  }, [props.cleanGround]);

  useEffect(() => {
    city.current?.setHousePick(
      props.pickingHouse
        ? (hit) => latest.current.onHouseHit?.(hit)
        : null,
    );
  }, [props.pickingHouse]);

  return (
    <div
      ref={host}
      className="city"
      aria-label="Interactive 3D Adliswil city"
    />
  );
});

export default City;
