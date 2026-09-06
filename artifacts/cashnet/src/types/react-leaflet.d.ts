import type { ComponentType } from "react";

// The upstream declarations depend on the optional Leaflet declaration package.
// Keep the demo's map props usable when that package is not linked locally.
declare module "react-leaflet" {
  export const MapContainer: ComponentType<any>;
  export const TileLayer: ComponentType<any>;
  export const CircleMarker: ComponentType<any>;
  export const Popup: ComponentType<any>;
  export function useMap(): any;
}
