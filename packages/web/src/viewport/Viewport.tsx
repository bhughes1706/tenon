import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, TransformControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Board, Model } from '@tenon/core'
import { worldAABB } from '@tenon/core'
import { jointMarkers } from '@tenon/core/markers'
import { pickJoint, extractJointFaces } from './jointPick.js'
import { pickArris } from './arrisPick.js'
import { peekBits, bitToEdgeProfile } from '../lib/bitsApi.js'
import { useModelStore } from '../lib/modelStore.js'
import { setViewportScene, syncViewportTheme } from '../lib/syncViewportTheme.js'
import { speciesColor } from '../lib/speciesColors.js'
import { formatInchesMark } from '../lib/fraction.js'
import { modelBounds } from './bounds.js'
import { computeExplodeOffsets } from './explode.js'
import { solveSnap, type AABB, type SnapGuide } from './snapping.js'
import { createViewportResources, type ViewportResources } from './viewportResources.js'

const deg2rad = (d: number) => (d * Math.PI) / 180
const rad2deg = (r: number) => (r * 180) / Math.PI
const round = (v: number, q = 1e-4) => Math.round(v / q) * q + 0 // +0 normalizes -0
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const voidRaycast = () => null

// Magnetic snap pull radius, screen pixels — converted to world units per drag so
// the feel is constant across zoom (§13 snapping). Tunable.
const SNAP_PX = 8

const VIEW_DIRS: Record<'iso' | 'front' | 'top' | 'right', [number, number, number]> = {
  iso: [1, 0.8, 1],
  front: [0, 0, 1],
  top: [0, 1, 0.0001],
  right: [1, 0, 0],
}

// ── Ghost markers (chunk 12, docs/chunk12-design.md §4) ─────────────────────
// Drawbore pins: render-only translucent cylinders derived from the model (never
// carved — the pin fills its hole). Physical wood color, not themed (see
// viewportResources doctrine); the selected joint's pins tint amber so they read
// with the joint-face highlight. Hidden while exploded — a pin drawn at its true
// position under diagrammatically-offset boards would point at nothing.
const PIN_COLOR = '#8a6a45'
const UP = new THREE.Vector3(0, 1, 0)

function GhostPins({ model, selectedJointId, jointColor }: {
  model: Model | null
  selectedJointId: string | null
  jointColor: string
}) {
  const pins = useMemo(() => {
    if (!model) return []
    return jointMarkers(model).map((m) => ({
      ...m,
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...m.axis).normalize()),
    }))
  }, [model])
  return (
    <>
      {pins.map((p, i) => {
        const selected = p.jointId === selectedJointId
        return (
          <mesh key={i} position={p.center} quaternion={p.quaternion} raycast={voidRaycast}>
            <cylinderGeometry args={[p.dia / 2, p.dia / 2, p.len, 16]} />
            <meshStandardMaterial
              transparent
              opacity={selected ? 0.75 : 0.4}
              depthWrite={false}
              color={selected ? jointColor : PIN_COLOR}
            />
          </mesh>
        )
      })}
    </>
  )
}

// ── One board ────────────────────────────────────────────────────────────────
function BoardMesh({
  board,
  carved,
  highlight,
  showHighlight,
  selectedJointId,
  ghosted,
  ghostOpacity,
  offset,
  selected,
  hovered,
  resources,
  setRef,
  onPointerDown,
  mode,
}: {
  board: Board
  carved: THREE.BufferGeometry | undefined
  // Joint-face overlay geometry for this board (bonus stage), or undefined if none.
  highlight: THREE.BufferGeometry | undefined
  showHighlight: boolean
  // The globally selected joint (chunk 11): if this board is its a or b, the joint's
  // faces get a tint + outline (extracted per board from provenance below).
  selectedJointId: string | null
  // Isolate mode (bonus stage): this board is a non-selected neighbour that should fade
  // so the selection reads against it; ghostOpacity is how faint.
  ghosted: boolean
  ghostOpacity: number
  // Exploded-view world offset added to the board's position (centroid-radial).
  offset: [number, number, number]
  selected: boolean
  hovered: boolean
  resources: ViewportResources
  setRef: (obj: THREE.Object3D | null) => void
  onPointerDown: (e: ThreeEvent<PointerEvent>, id: string) => void
  mode: string
}) {
  const [rx, ry, rz] = board.transform.rot
  const [px, py, pz] = board.transform.pos
  const color = useMemo(() => speciesColor(board.species), [board.species])

  // Faces of the SELECTED joint on this board (null unless this board is its a/b).
  // Dispose-on-replace via ref rather than an effect cleanup (gotcha #12): dispose()
  // only frees GPU buffers — if a concurrent render is discarded mid-flight the
  // worst case is a one-frame re-upload, never a crash.
  const jointHiRef = useRef<THREE.BufferGeometry | null>(null)
  const selectedJointGeom = useMemo(() => {
    jointHiRef.current?.dispose()
    jointHiRef.current = selectedJointId && carved ? extractJointFaces(carved, selectedJointId) : null
    return jointHiRef.current
  }, [carved, selectedJointId])
  // Flat box fallback while the worker carves (or for joint-free boards). Not manually
  // disposed: R3F tears down the WebGL context on Canvas unmount (freeing the buffers),
  // and disposing a useMemo'd object in an effect cleanup is unsafe under StrictMode.
  const boxGeom = useMemo(
    () => new THREE.BoxGeometry(board.dims.l, board.dims.w, board.dims.t),
    [board.dims.l, board.dims.w, board.dims.t],
  )
  // Carved mesh comes back in the board's LOCAL frame (centred at origin, same as the
  // box), so the <group> transform places it identically — the gizmo still moves the
  // board, not the geometry (chunk 9 §5). The carved geometry is owned by the store
  // (disposed there on replace); never dispose it here.
  const geom = carved ?? boxGeom
  const outlineMat = selected ? resources.selectionMat : resources.hoverMat

  return (
    <group
      ref={setRef}
      position={[px + offset[0], py + offset[1], pz + offset[2]]}
      rotation={[deg2rad(rx), deg2rad(ry), deg2rad(rz)]}
    >
      <mesh
        castShadow
        receiveShadow
        onPointerDown={(e) => onPointerDown(e, board.id)}
        onPointerOver={(e) => {
          if (mode !== 'add') {
            e.stopPropagation()
            useModelStore.getState().setHovered(board.id)
          }
        }}
        onPointerOut={() => {
          if (useModelStore.getState().hovered === board.id) useModelStore.getState().setHovered(null)
        }}
      >
        <primitive object={geom} attach="geometry" />
        {/* Isolate mode just fades the whole non-selected board. Two non-obvious bits:
            (1) the `key` remounts the material when ghosted flips — toggling `transparent`
            on an already-rendered material doesn't re-enable blending in R3F (an early
            "clipping" symptom was just transparency never turning on). (2) the ghost sets
            depthWrite:false. A transparent mesh that writes depth z-fights its own faces
            (drawn in buffer order, never depth-sorted within a mesh) and the coincident
            solid board — that was the real cause of the tenon rendering at the wrong height.
            depthTest stays on, so the opaque selected board still correctly occludes the
            ghost behind it. */}
        <meshStandardMaterial
          key={ghosted ? 'ghost' : 'solid'}
          color={color}
          roughness={0.7}
          metalness={0}
          transparent={ghosted}
          opacity={ghosted ? ghostOpacity : 1}
          depthWrite={!ghosted}
        />
      </mesh>
      {/* Joint-face overlay (mortise walls / tenon cheeks / shoulders) — shared amber
          material with polygonOffset, never pickable. */}
      {showHighlight && highlight && (
        <mesh geometry={highlight} material={resources.jointMat} raycast={voidRaycast} />
      )}
      {/* Selected-joint faces (chunk 11 face-pick): amber tint + selection-colored
          outline so ONE joint reads distinctly even when the global overlay is on. */}
      {selectedJointGeom && (
        <>
          <mesh geometry={selectedJointGeom} material={resources.jointMat} raycast={voidRaycast} />
          <lineSegments raycast={voidRaycast}>
            <edgesGeometry args={[selectedJointGeom]} />
            <primitive object={resources.selectionMat} attach="material" />
          </lineSegments>
        </>
      )}
      {(selected || hovered) && (
        <lineSegments raycast={voidRaycast}>
          <edgesGeometry args={[geom]} />
          <primitive object={outlineMat} attach="material" />
        </lineSegments>
      )}
    </group>
  )
}

// ── Camera framing on view-preset requests ─────────────────────────────────────
function CameraRig({ controlsRef }: { controlsRef: React.MutableRefObject<{ target: THREE.Vector3; update: () => void } | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const viewRequest = useModelStore((s) => s.viewRequest)

  useEffect(() => {
    const { center, radius } = modelBounds(useModelStore.getState().model)
    const fov = ((camera.fov ?? 35) * Math.PI) / 180
    const dist = Math.max(radius / Math.sin(Math.min(fov / 2, Math.PI / 2 - 0.01)), 14)
    const [dx, dy, dz] = VIEW_DIRS[viewRequest.view]
    const len = Math.hypot(dx, dy, dz)
    camera.position.set(center.x + (dx / len) * dist, center.y + (dy / len) * dist, center.z + (dz / len) * dist)
    camera.near = Math.max(dist / 100, 0.1)
    camera.far = dist * 10 + 200
    camera.updateProjectionMatrix()
    const controls = controlsRef.current
    if (controls) {
      controls.target.copy(center)
      controls.update()
    } else {
      camera.lookAt(center)
    }
  }, [viewRequest, camera, controlsRef])

  return null
}

// ── Scene graph (inside Canvas) ────────────────────────────────────────────────
function SceneContents({
  resources,
  precision,
  shadows,
}: {
  resources: ViewportResources
  precision: number
  shadows: boolean
}) {
  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const model = useModelStore((s) => s.model)
  const meshes = useModelStore((s) => s.meshes)
  const jointMeshes = useModelStore((s) => s.jointMeshes)
  const selection = useModelStore((s) => s.selection)
  const selectedJointId = useModelStore((s) => s.selectedJointId)
  const hovered = useModelStore((s) => s.hovered)
  const mode = useModelStore((s) => s.mode)
  const gizmoMode = useModelStore((s) => s.gizmoMode)
  const exploded = useModelStore((s) => s.exploded)
  const isolate = useModelStore((s) => s.isolate)
  const highlightJoints = useModelStore((s) => s.highlightJoints)
  const dispatch = useModelStore((s) => s.dispatch)

  // Exploded-view offsets (centroid-radial, axis-snapped). Empty map when assembled.
  const explodeOffsets = useMemo(() => computeExplodeOffsets(model, exploded), [model, exploded])
  const ZERO_OFFSET: [number, number, number] = [0, 0, 0]

  // Isolate mode: fade non-selected boards (selection-gated, so nothing fully vanishes).
  // Linear so the slider reads directly: isolate 0.85 → 0.15 opacity (clearly a ghost),
  // isolate 1 → fully hidden (joint highlights still show — they're a separate solid mesh).
  const isolateActive = isolate > 0 && selection.length > 0
  const ghostOpacity = 1 - isolate

  // Re-carve geometry on every model change (load/optimistic/undo/redo/SSE). The
  // worker coalesces bursts and the store drops stale results; boards fall back to a
  // flat box until their carved mesh lands (chunk 9 §5). Spawns the worker lazily on
  // first run (designer mount), so the jobs/photos bundle never pulls the WASM.
  useEffect(() => {
    useModelStore.getState().evaluateGeometry()
  }, [model])

  const meshRefs = useRef(new Map<string, THREE.Object3D>())
  const registerRef = useCallback((id: string, obj: THREE.Object3D | null) => {
    if (obj) meshRefs.current.set(id, obj)
    else meshRefs.current.delete(id)
  }, [])
  // Stable per-board ref setters: created once per id, cached in a ref-map, so
  // BoardMesh never receives a new function prop just because the scene re-rendered.
  const refSetters = useRef(new Map<string, (obj: THREE.Object3D | null) => void>())
  const getRefSetter = useCallback(
    (id: string) => {
      let setter = refSetters.current.get(id)
      if (!setter) {
        setter = (obj: THREE.Object3D | null) => registerRef(id, obj)
        refSetters.current.set(id, setter)
      }
      return setter
    },
    [registerRef],
  )

  const selectedId = selection.length === 1 ? selection[0] : null
  const selectedLocked = selectedId ? model?.boards.find((b) => b.id === selectedId)?.locked ?? false : false
  const [gizmoTarget, setGizmoTarget] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    // A locked board gets no gizmo — dragging/rotating it would just be rejected
    // server-side (validateOps), so don't let the user start a drag at all.
    setGizmoTarget(selectedId && !selectedLocked ? meshRefs.current.get(selectedId) ?? null : null)
  }, [selectedId, selectedLocked, model])

  const [measurePts, setMeasurePts] = useState<THREE.Vector3[]>([])
  useEffect(() => {
    if (mode !== 'measure') setMeasurePts([])
  }, [mode])

  // Magnetic-snap drag state. The cache (set on gizmo mouse-down) holds the dragged
  // board's half-extents + every other board's world AABB so the per-frame solver
  // (snapping.ts) stays allocation-free. `snapGuides` are the live alignment hints.
  const dragCache = useRef<{ half: [number, number, number]; others: AABB[] } | null>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const altPressed = useRef(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Alt') altPressed.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Alt') altPressed.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, id: string) => {
      // Face-pick (chunk 11): which joint, if any, owns the clicked triangle. The
      // carved geometry is de-indexed soup, so raycast faceIndex IS the triangle
      // index into userData.provenance; the flat-box fallback has no provenance
      // and resolves to null (board selection, as before).
      const clickedJoint = pickJoint((e.object as THREE.Mesh).geometry as THREE.BufferGeometry, e.faceIndex)

      if (e.nativeEvent.button === 2) {
        // Right-click targets this board (or joint face) for the context menu
        // (§19.3) without disturbing a multi-selection that already includes it.
        // The native contextmenu fires next and opens the Radix menu.
        e.stopPropagation()
        const st = useModelStore.getState()
        if (clickedJoint) {
          st.setSelectedJoint(clickedJoint)
          st.setMenuTarget('joint')
          return
        }
        if (!st.selection.includes(id)) st.setSelection([id])
        st.setMenuTarget(useModelStore.getState().selection.length > 1 ? 'multi' : 'board')
        return
      }
      const m = useModelStore.getState().mode
      if (m === 'measure') {
        e.stopPropagation()
        setMeasurePts((prev) => (prev.length >= 2 ? [e.point.clone()] : [...prev, e.point.clone()]))
        return
      }
      if (m === 'router') {
        // Paint an edge profile (§3.5): resolve the click to an arris in the board's LOCAL
        // frame (worldToLocal undoes transform + explode), fill it from the armed bit, and
        // toggle. No pre-commit dialog — the carve IS the preview (§8), one undo away.
        e.stopPropagation()
        const st = useModelStore.getState()
        const board = st.model?.boards.find((b) => b.id === id)
        if (!board) return
        const p = (e.object as THREE.Object3D).worldToLocal(e.point.clone())
        const arris = pickArris([p.x, p.y, p.z], board.dims)
        const bit = st.routerBitId ? peekBits().find((b) => b.id === st.routerBitId) : undefined
        const profile = bit ? bitToEdgeProfile(bit, arris.edge, arris.face) : null
        void st.paintArris(id, arris, profile)
        return
      }
      if (m === 'select') {
        e.stopPropagation()
        const additive = e.nativeEvent.shiftKey || e.nativeEvent.metaKey || e.nativeEvent.ctrlKey
        // A plain click on a joint-cut face selects the JOINT (§13 face-click →
        // joint). Additive clicks keep board multi-select semantics — joint pick
        // is single-select only.
        if (!additive && clickedJoint) {
          useModelStore.getState().setSelectedJoint(clickedJoint)
          return
        }
        useModelStore.getState().toggleSelection(id, additive)
      }
    },
    [],
  )

  // Drag start: snapshot AABBs once (boards don't move mid-drag). Translate only —
  // rotation uses the gizmo's own rotationSnap.
  const onGizmoDown = useCallback(() => {
    const m = useModelStore.getState().model
    if (gizmoMode !== 'translate' || !selectedId || !m) {
      dragCache.current = null
      return
    }
    const others: AABB[] = []
    let half: [number, number, number] = [0, 0, 0]
    for (const b of m.boards) {
      const box = worldAABB(b)
      if (b.id === selectedId) {
        half = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2]
      } else {
        others.push(box)
      }
    }
    dragCache.current = { half, others }
  }, [gizmoMode, selectedId])

  // Per-frame during a translate drag: pull the dragged object toward nearby board
  // faces/edges/ends (magnetism), else grid. Alt suspends magnetism.
  const onGizmoChange = useCallback(() => {
    const cache = dragCache.current
    if (!cache || !gizmoTarget) return
    const magnetic = !altPressed.current
    const d = camera.position.distanceTo(gizmoTarget.position)
    const worldPerPx = (2 * d * Math.tan(deg2rad(camera.fov) / 2)) / Math.max(size.height, 1)
    const threshold = clamp(SNAP_PX * worldPerPx, 0.01, 2)
    const res = solveSnap({
      center: [gizmoTarget.position.x, gizmoTarget.position.y, gizmoTarget.position.z],
      half: cache.half,
      others: cache.others,
      grid: useModelStore.getState().snapGrid,
      threshold,
      magnetic,
    })
    gizmoTarget.position.set(res.pos[0], res.pos[1], res.pos[2])
    setSnapGuides(res.guides)
  }, [gizmoTarget, camera, size])

  const commitTransform = useCallback(() => {
    setSnapGuides([])
    dragCache.current = null
    if (!gizmoTarget || !selectedId) return
    const board = useModelStore.getState().model?.boards.find((b) => b.id === selectedId)
    if (!board) return
    // Position is already grid/magnet-snapped by onGizmoChange — just clean float noise.
    const pos: [number, number, number] = [
      round(gizmoTarget.position.x, 1e-3),
      round(gizmoTarget.position.y, 1e-3),
      round(gizmoTarget.position.z, 1e-3),
    ]
    const rot: [number, number, number] = [
      round(rad2deg(gizmoTarget.rotation.x), 1e-3),
      round(rad2deg(gizmoTarget.rotation.y), 1e-3),
      round(rad2deg(gizmoTarget.rotation.z), 1e-3),
    ]
    // A click on the gizmo with no drag fires mouseUp too — skip the no-op op so
    // it doesn't pollute the undo stack.
    const unchanged =
      pos.every((v, i) => Math.abs(v - board.transform.pos[i]) < 1e-6) &&
      rot.every((v, i) => Math.abs(v - board.transform.rot[i]) < 1e-6)
    if (unchanged) return
    void dispatch([{ op: 'transform_board', id: selectedId, pos, rot }])
  }, [gizmoTarget, selectedId, dispatch])

  const measureColor = `#${resources.measureMat.color.getHexString()}`
  const snapColor = `#${resources.snapMat.color.getHexString()}`

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[24, 48, 18]}
        intensity={1.1}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <directionalLight position={[-20, 16, -24]} intensity={0.3} />

      <primitive object={resources.gridMinor} />
      <primitive object={resources.gridMajor} />

      {shadows && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow raycast={voidRaycast}>
          <planeGeometry args={[400, 400]} />
          <shadowMaterial opacity={0.22} />
        </mesh>
      )}

      {model?.boards.map((b) => (
        <BoardMesh
          key={b.id}
          board={b}
          carved={meshes.get(b.id)}
          highlight={jointMeshes.get(b.id)}
          showHighlight={highlightJoints}
          selectedJointId={selectedJointId}
          ghosted={isolateActive && !selection.includes(b.id)}
          ghostOpacity={ghostOpacity}
          offset={explodeOffsets.get(b.id) ?? ZERO_OFFSET}
          selected={selection.includes(b.id)}
          hovered={hovered === b.id}
          resources={resources}
          mode={mode}
          setRef={getRefSetter(b.id)}
          onPointerDown={onPointerDown}
        />
      ))}

      {exploded === 0 && (
        <GhostPins
          model={model}
          selectedJointId={selectedJointId}
          jointColor={`#${resources.jointMat.color.getHexString()}`}
        />
      )}

      {measurePts.map((p, i) => (
        <mesh key={i} position={p} raycast={voidRaycast}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color={measureColor} />
        </mesh>
      ))}
      {measurePts.length === 2 && (
        <>
          <Line points={[measurePts[0], measurePts[1]]} color={measureColor} lineWidth={2} />
          <Html position={measurePts[0].clone().lerp(measurePts[1], 0.5)} center occlude={false} zIndexRange={[40, 0]}>
            <div
              style={{
                background: 'var(--surface-overlay)',
                color: 'var(--text)',
                border: '1px solid var(--border-strong)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                transform: 'translateY(-50%)',
              }}
            >
              {formatInchesMark(measurePts[0].distanceTo(measurePts[1]), precision)}
            </div>
          </Html>
        </>
      )}

      {snapGuides.map((g, i) => (
        <Line
          key={`snap-${i}`}
          points={[g.from, g.to]}
          color={snapColor}
          lineWidth={1.5}
          dashed
          dashSize={0.25}
          gapSize={0.15}
        />
      ))}

      {/* Right mouse is reserved for the context menu (§19.3): rotate on left,
          pan on middle-drag, zoom on wheel. */}
      <OrbitControls
        ref={controlsRef as never}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: undefined as unknown as THREE.MOUSE }}
      />
      {/* Gizmo is hidden while exploded — editing a board shown at a diagrammatic offset
          (its real transform is elsewhere) would be misleading. */}
      {gizmoTarget && mode === 'select' && exploded === 0 && (
        <TransformControls
          object={gizmoTarget}
          mode={gizmoMode}
          // We own snapping (grid + magnetism) in onObjectChange so the two don't
          // fight; the built-in translationSnap stays off (§13).
          translationSnap={null}
          rotationSnap={deg2rad(15)}
          onMouseDown={onGizmoDown}
          onObjectChange={onGizmoChange}
          onMouseUp={commitTransform}
        />
      )}
      <CameraRig controlsRef={controlsRef} />
    </>
  )
}

// ── Public viewport ────────────────────────────────────────────────────────────
export function Viewport({ precision, shadows }: { precision: number; shadows: boolean }) {
  const resources = useMemo(() => createViewportResources(), [])
  const setScene = useModelStore((s) => s.setScene)

  useEffect(() => {
    setViewportScene(resources.scene)
    setScene(resources.scene)
    syncViewportTheme(resources.scene) // pull current --vp-* values immediately
    // No resources.dispose() here: the WebGL context teardown on Canvas unmount
    // frees the GPU buffers, and disposing a retained useMemo under StrictMode's
    // mount→unmount→mount cycle would leave the second mount with dead materials.
    return () => {
      setViewportScene(undefined)
      setScene(null)
    }
  }, [resources, setScene])

  return (
    <Canvas
      shadows={shadows}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [36, 30, 36], fov: 35, near: 0.1, far: 2000 }}
      onCreated={({ scene }) => {
        scene.background = resources.background
      }}
      onPointerMissed={(e) => {
        const st = useModelStore.getState()
        if ((e as MouseEvent).button === 2) {
          // Right-click on empty space → empty-space context menu (Add board, views).
          st.setMenuTarget('empty')
          st.clearSelection()
          return
        }
        if (st.mode === 'select') st.clearSelection()
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <SceneContents resources={resources} precision={precision} shadows={shadows} />
    </Canvas>
  )
}
