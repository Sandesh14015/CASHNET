// The package is loaded at runtime; this fallback keeps the demo buildable in
// constrained installs where the optional @types/leaflet package is absent.
declare module "leaflet" {
  export class Layer { addTo(target: unknown): this; }
}
