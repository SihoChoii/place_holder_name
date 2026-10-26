"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Camera, Observer } from "./astronomy";

export const PRESETS: Observer[] = [
  { name: "Starbase, Texas", latitude: 25.997, longitude: -97.156 },
  { name: "Greenwich, London", latitude: 51.4779, longitude: -0.0015 },
  { name: "Paranal, Chile", latitude: -24.627, longitude: -70.404 },
];
type State = {
  observer: Observer;
  camera: Camera;
  setCamera: React.Dispatch<React.SetStateAction<Camera>>;
  choose: (o: Observer) => void;
  locationStatus: string;
  locate: () => void;
};
const Context = createContext<State | null>(null);
let initialLocation: Promise<GeolocationPosition> | undefined;
function getLocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 3000,
      maximumAge: 300000,
    });
  });
}
export function ObserverProvider({ children }: { children: React.ReactNode }) {
  const [observer, setObserver] = useState(PRESETS[0]);
  const [camera, setCamera] = useState<Camera>({
    azimuth: 270,
    altitude: 35,
    fov: 85,
  });
  const [locationStatus, setStatus] = useState(
    "Using Starbase while location is requested.",
  );
  const generation = useRef(0);
  const choose = (o: Observer) => {
    generation.current++;
    setObserver(o);
    setStatus("Place selected. Time stays live.");
  };
  const apply = (
    p: Promise<GeolocationPosition>,
    generationAtRequest: number,
  ) => {
    p.then((result) => {
      if (generation.current === generationAtRequest) {
        setObserver({
          name: "Your location",
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        });
        setStatus("Using your location. Coordinates stay on this device.");
      }
    }).catch(() => {
      if (generation.current === generationAtRequest)
        setStatus("Location unavailable or denied. Using Starbase.");
    });
  };
  useEffect(() => {
    initialLocation ??= getLocation();
    apply(initialLocation, generation.current);
  }, []);
  const locate = () => {
    const n = ++generation.current;
    setObserver(PRESETS[0]);
    setStatus("Requesting location. Using Starbase for now.");
    apply(getLocation(), n);
  };
  return (
    <Context.Provider
      value={{ observer, camera, setCamera, choose, locationStatus, locate }}
    >
      {children}
    </Context.Provider>
  );
}
export function useObserver() {
  const value = useContext(Context);
  if (!value) throw new Error("ObserverProvider missing");
  return value;
}
