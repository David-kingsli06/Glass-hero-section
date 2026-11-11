# Master Specification & Prompt: Facet “Designed in glass” Hero

> **Purpose**: This document contains the exhaustive, pixel-perfect, and mathematically rigorous prompt required to recreate the exact **Facet "Designed in glass" WebGL Hero Section** with Next.js App Router, TypeScript, Tailwind CSS, and Three.js 0.169.0.

---

```markdown
# Prompt: Facet “Designed in glass” Hero — Next.js / TypeScript / Tailwind / WebGL

Build an uncompromising, production-grade, single-screen WebGL hero experience for a fictional real-time material laboratory, **Facet**.

The visual metaphor is a dark editorial website physically printed across **thick, dark smoked-glass shards floating over pure black (#050507)**. The interface slab responds dynamically to cursor pressure and tilt. Hovering a shard causes it to physically rise on a damped spring, tip subtly toward the cursor, flare with iridescent sheen, and catch an injected lavender light. 

Clicking **“Read paper →”** physically shatters the interface, sending shards and their attached printed typography flying into 3D space with velocity, gravity, and tumbling rotations, revealing a second minimalist definitions view with a floating back sliver. Clicking **“← Back”** shrinks the sliver and reassembles the original glass interface along reverse trajectories with staggered ease-out-back spring settling.

---

## 1. Technical Stack Constraints

- **Framework**: Next.js (App Router, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`).
- **Core Libraries**: React 19 / 18, TypeScript (strict mode, zero `any`), Tailwind CSS.
- **3D Engine**: Three.js `0.169.0` with `RoomEnvironment` addon.
- **Typography**: Local self-hosted Inter variable font via `@fontsource/inter` (weights 400, 500, 600, 700).
- **Prohibited Libraries**:
  - NO GSAP
  - NO Framer Motion
  - NO React Three Fiber (R3F)
  - NO external physics libraries (e.g. Cannon.js, Rapier)
  - NO external icon sets, stock photos, or image bitmaps
- Native browser APIs (`requestAnimationFrame`, `ResizeObserver`, pointer events) and native custom physics only.

---

## 2. Geometry & Spatial Coordinate System

### 2.1 Camera & Viewport Synchronization
- **Projection**: `PerspectiveCamera` with fixed vertical FOV of `30°`.
- **Coordinate Mapping**: Position the camera at `z = (viewportHeight / 2) / tan(15°)` so that:
  $$\text{1 world unit} = \text{1 CSS pixel at } z = 0$$
- Reference composition base: `1440 × 960 px`. Responsive scale factor:
  $$S = \frac{\text{blockWidth}}{1730}$$

### 2.2 Page Block Layout
- The entire glass interface sits inside a single centered block:
  - Desktop horizontal margins: `5.5vw`
  - Desktop vertical margins: `8.5vh`
  - Mobile margins: `16px`
- The block is divided vertically:
  - **Nav Slab**: Occupies top `10.8%` of block height.
  - **Void Gap**: Inter-shard spacing of `14 · S px` exposing the `#050507` background.
  - **Shard Panel**: Occupies remaining height.

### 2.3 5-Cell Asymmetrical Shard Topology
The shard panel is divided into exactly five custom asymmetrical cells using normalized coordinates ($x \in [0, 1]$ right, $y \in [0, 1]$ down):
- **Edge Anchor Points**:
  - Top edge: $t_0 = 0.22$, $t_1 = 0.515$, $t_2 = 0.84$
  - Bottom edge: $b_0 = 0.34$, $b_1 = 0.865$
- **Inner Junctions**:
  - $J_0 = (0.385, 0.72)$
  - $J_1 = (0.480, 0.62)$
  - $J_2 = (0.716, 0.49)$
- **Cell Vertex Sequences**:
  - **Cell A (Hero Cell)**: $TL \to t_0 \to J_0 \to b_0 \to BL$
  - **Cell B**: $t_0 \to t_1 \to J_1 \to J_0$
  - **Cell C**: $t_1 \to t_2 \to J_2 \to J_1$
  - **Cell D**: $J_0 \to J_1 \to J_2 \to b_1 \to b_0$
  - **Cell E**: $t_2 \to TR \to BR \to b_1 \to J_2$

### 2.4 Physical Glass Extrusion & Edge Inset
- To keep shards cleanly separated by dark voids, polygons are inset toward their respective centroids by half the gap ($\approx 7 \cdot S\text{ px}$).
- Extrude each cell with `THREE.ExtrudeGeometry`:
  - Corner radius: $14 \cdot S\text{ px}$ (generated via smooth quadratic curve fillets between adjacent edges)
  - Depth: $13 \cdot S\text{ px}$
  - Bevel enabled: `true`
  - Bevel size: $2.6 \cdot S\text{ px}$
  - Bevel thickness: $2.6 \cdot S\text{ px}$
  - Bevel segments: `3`
- Center all geometries along the local Z-axis so front and rear bevels sit symmetrically around $z = 0$.

---

## 3. Materials, Lighting & Custom Shader Injections

### 3.1 Smoked Glass Material (`MeshPhysicalMaterial`)
- Base Color: `#17171b` (smoked dark charcoal)
- Roughness: `0.36`
- Clearcoat: `0.70`, Clearcoat Roughness: `0.12`
- Specular Intensity: `0.70`
- Metalness: `0.05`
- Transmission / Transparency: `opacity: 0.98`, `transparent: true`
- Rest Iridescence: `0.55`, IOR: `1.3`, Thickness Range: `[250, 650] nm`
- Environment Map: Generated via `PMREMGenerator` and `RoomEnvironment` with `environmentIntensity = 0.42`.
- Key Light: Directional light from top-left (`[-600, 800, 700]`), soft white-blue (`#dbeafe`), intensity `1.4`. Ambient light `0.20`.

### 3.2 Injected Lavender Cursor Glow Shader
Use `material.onBeforeCompile` to inject custom uniforms and fragment logic:
- Uniforms:
  - `uPointerWorld`: World position of the raycasted pointer.
  - `uGlowIntensity`: `0.16`
  - `uGlowRadius`: `300 · S px`
  - `uIsHovered`: `1.0` when pointer is active over the slab, `0.0` otherwise.
- Injected GLSL fragment shader computation:
  ```glsl
  float d = length(vWorldPositionCustom - uPointerWorld);
  float glowFactor = exp(-1.6 * pow(d / max(uGlowRadius, 1.0), 2.0));
  vec3 lavenderGlow = vec3(0.42, 0.37, 0.62) * uGlowIntensity * glowFactor * uIsHovered;
  gl_FragColor.rgb += lavenderGlow;
  ```

---

## 4. Typography & Continuous Printed Glass Artwork

Typography must look physically screen-printed onto the top glass faces:

### 4.1 Continuous Master Canvas Texture
- Maintain a single continuous off-screen canvas at DPR $\ge 1.5$ sized to the full shard panel dimensions.
- Render all hero typography onto this single canvas:
  1. **Eyebrow**: `REAL-TIME MATERIAL STUDIO`
     - Weight: 600, Size: $\max(9, 11 \cdot S\text{ px})$, Letter-spacing: `0.2em`, Color: `rgba(255,255,255,0.42)`
     - Top position: `13.5%` of panel height
  2. **Headline**: `Designed / in glass.`
     - Weight: 500, Tracking: `-0.045em`, Leading: `0.97`
     - Font size: $\min(7.8\% \cdot \text{panelWidth}, 20\% \cdot \text{panelHeight})$
     - Vertical linear gradient: `#e4e4e8` $\to$ `#dcdce0` $\to$ `#a6a6ad`
  3. **Supporting Copy**:
     - `Author dispersion, transmission, and refraction in the browser. Live previews, real materials.`
     - Weight: 400, Size: $\max(13, 15 \cdot S\text{ px})$, Color: `rgba(255,255,255,0.58)`
  4. **CTA Buttons**:
     - `Open studio`: $116 \times 40 \cdot S\text{ px}$, pill border radius `6 · S px`, subtle translucent background.
     - `Read paper →`: Understated white link.
  5. **Footer Metadata**:
     - Bottom-left: `© Facet Lab`
     - Bottom-right: `KHR_materials_dispersion`
     - Size: $11 \cdot S\text{ px}$, Color: `rgba(255,255,255,0.36)`

### 4.2 UV-Mapped ShapeGeometry Slices
- For each cell (A through E), create a matching `THREE.ShapeGeometry` placed exactly at the front bevel plane ($z = \text{extrudeDepth}/2 + \text{bevelThickness} + 0.6\text{ px}$).
- Compute each vertex's UV coordinate mapped directly to its global panel normalized position:
  $$u = \frac{x_{\text{world}} + \text{blockWidth}/2}{\text{blockWidth}}, \quad v = \frac{y_{\text{world}} + \text{panelHeight}/2}{\text{panelHeight}}$$
- When a shard lifts, rotates, or shatters, its printed typography slice stays permanently locked to its physical body.

---

## 5. Interaction Systems & Physics Engine

### 5.1 Organic Cut-Line Breathing
- Every internal junction point ($J_0, J_1, J_2$) and edge point drifts with slow, deterministic trigonometric functions (periods 10–20s):
  $$\Delta x \in [\pm 0.03], \quad \Delta y \in [\pm 0.05]$$
- Rebuild geometry at a throttled rate of **45Hz** (~22ms interval) with clean disposal of previous geometries.

### 5.2 Cursor-Driven Point Push
- When pointer approaches any shard junction, push nearby vertices away:
  - Influence radius: $0.6$ (normalized units)
  - Max displacement: $0.05$
  - Causes the cell directly under cursor to expand subtly.

### 5.3 Global Slab 3D Tilt
- Pointer position relative to center $[-1, +1]$ tilts the entire `blockGroup`:
  $$\text{targetRotY} = x_{\text{norm}} \cdot 7^\circ - 1.2^\circ$$
  $$\text{targetRotX} = -y_{\text{norm}} \cdot 5.5^\circ + 0.8^\circ$$
- Smooth using exponential damping with a $0.3\text{s}$ time constant:
  $$\text{rot} \mathrel{+}= (\text{targetRot} - \text{rot}) \cdot (1 - e^{-\Delta t / 0.3})$$

### 5.4 Individual Shard Hover Reaction
- Raycast pointer against glass meshes:
  - Target Lift: $50 \cdot S\text{ px}$ (shards), $32 \cdot S\text{ px}$ (nav slab).
  - Target Tip: $\pm 0.12\text{ rad}$ dipping away from the pointer.
  - Hover Iridescence: ramps to `1.0`, Environment intensity ramps to `1.9`.
- Dynamic Damped Spring physics:
  $$F_z = k \cdot (z_{\text{target}} - z) - c \cdot v_z, \quad \text{with } k = 170, \; c = 19$$

---

## 6. Transitions & State Machine

State model: `INTRO` $\to$ `INTERACTIVE` $\to$ `SHATTERING` $\to$ `DEFINITIONS` $\to$ `REASSEMBLING` $\to$ `INTERACTIVE`.

### 6.1 Shatter Transition
- Triggered by clicking `Read paper →`.
- Nav flies first, followed by shards staggered by $30\text{–}40\text{ms}$.
- Duration: $0.72\text{s}$ with cubic ease-in ($t^3$).
- Velocities per piece:
  - Camera-directed impulse: $420\text{–}800 \cdot S\text{ px/s}$
  - Downward gravity acceleration: $900 \cdot S\text{ px/s}^2$
  - Outward lateral velocity along centroid angle
  - 3D tumbling rotation: $2.0\text{–}3.6\text{ rad/s}$ around deterministic unique axes.

### 6.2 Definitions View & Back Sliver
- At $t = 0.28\text{s}$ after shatter starts, fade in the definitions view ($0.4\text{s}$ duration).
- Back Sliver:
  - Viewport-normalized coordinates: $(0.147, 0.243), (0.252, 0.169), (0.287, 0.277), (0.151, 0.258)$.
  - Extrusion depth $11 \cdot (W / 1918)$, thin bright bevel, resting orientation $\text{rotY} = -0.16$, $\text{rotX} = 0.08$.
  - Continuous idle wobble: $\pm 0.035\text{ rad}$ at $\approx 1.0\text{Hz}$.
  - Hover: tips up $+0.14\text{ rad}$, label `← Back` shifts to `#b9abff`.
- Definitions content (exact typography):
  - Column origin: `left: 32.4vw`, `width: 33.9vw`, `top: 35.9vh`
  - Heading: `Real-time glass, in five terms.` (Inter 650, `1.36vw`, tracking `-0.022em`)
  - 5 Exact Definitions:
    1. **Iridescence** — Optical color play caused by thin-film interference at varying angles.
    2. **Index of refraction** — Ratio of light speed in vacuum to phase velocity inside the medium.
    3. **Dispersion** — Variation of refractive index with wavelength, separating white light into spectral bands.
    4. **Transmission** — Fraction of radiant flux passing through physical glass without scattering or absorption.
    5. **Roughness** — Micro-surface irregularities determining specular highlight clarity and diffuse spread.

### 6.3 Reassembly Transition
- Clicking `← Back` shrinks the back sliver, fades definitions, and reverses all shard trajectories.
- Shards reassemble with `ease-out-back` overshoot ($c_1 = 1.35, c_3 = 2.35$), restoring nav slab first, followed by shards staggered by $30\text{ms}$ intervals.

---

## 7. Accessibility, Homography Layer & Fallbacks

- **Homography DOM Sync**: An invisible, accessible semantic HTML overlay sits above the WebGL canvas, mirrored in 3D using CSS `transform: perspective(...) rotateX(...) rotateY(...)` calculated from the current slab tilt. Text selection works natively with browser blue selection color.
- **Accessible Controls**: Genuine `<button>` and `<a>` elements for navigation, `Open studio`, `Read paper →`, and `← Back`.
- **Reduced Motion & No-WebGL Fallback**: If `prefers-reduced-motion` is active or WebGL fails, render a high-taste static smoked-glass HTML/CSS fallback retaining the dark aesthetic, headline, copy, and tabbed view switching without animation crashes.
```
