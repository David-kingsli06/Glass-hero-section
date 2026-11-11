'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { InteractionState, CellId } from './types';

interface FacetHeroProps {
  onStateChange?: (state: InteractionState) => void;
}

export default function FacetHero({ onStateChange }: FacetHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const domLayerRef = useRef<HTMLDivElement>(null);
  const backSliverDomRef = useRef<HTMLButtonElement>(null);

  const [currentState, setCurrentState] = useState<InteractionState>('intro');
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [isHoveredOpenStudio, setIsHoveredOpenStudio] = useState<boolean>(false);
  const [isHoveredReadPaper, setIsHoveredReadPaper] = useState<boolean>(false);
  const [isHoveredBack, setIsHoveredBack] = useState<boolean>(false);

  // Keep interaction state ref for high-frequency access in animation loop
  const stateRef = useRef<InteractionState>('intro');
  const updateState = useCallback(
    (newState: InteractionState) => {
      stateRef.current = newState;
      setCurrentState(newState);
      if (onStateChange) onStateChange(newState);
    },
    [onStateChange]
  );

  // Trigger Shatter
  const triggerShatter = useCallback(() => {
    if (stateRef.current !== 'interactive') return;
    updateState('shattering');
  }, [updateState]);

  // Trigger Reassembly
  const triggerBack = useCallback(() => {
    if (stateRef.current !== 'definitions') return;
    updateState('reassembling');
  }, [updateState]);

  useEffect(() => {
    // Check reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handleMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleMotionChange);

    // Check WebGL availability
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      setHasWebGL(false);
      return () => mediaQuery.removeEventListener('change', handleMotionChange);
    }

    return () => {
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  // Main Three.js Scene Setup & Render Loop
  useEffect(() => {
    if (!hasWebGL || !containerRef.current || !canvasRef.current) return;

    let isDisposed = false;
    let animationFrameId: number;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // Viewport & Scale calculation
    let viewportW = window.innerWidth;
    let viewportH = window.innerHeight;

    // Camera setup (fov = 30 deg, 1 world unit = 1 CSS px at z = 0)
    // distance = (viewportH / 2) / tan(15 deg)
    const fov = 30;
    const camera = new THREE.PerspectiveCamera(fov, viewportW / viewportH, 10, 15000);
    const cameraZ = (viewportH / 2) / Math.tan((fov * Math.PI) / 360);
    camera.position.set(0, 0, cameraZ);
    camera.lookAt(0, 0, 0);

    // Scene & Environment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050507);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(viewportW, viewportH);

    // Environment Lighting
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envMap = pmremGenerator.fromScene(roomEnv).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();
    roomEnv.dispose();

    // Soft white-blue key light from top-left
    const keyLight = new THREE.DirectionalLight(0xdbeafe, 1.4);
    keyLight.position.set(-600, 800, 700);
    scene.add(keyLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    // Block container group that tilts globally
    const blockGroup = new THREE.Group();
    scene.add(blockGroup);

    // Back sliver group in the scene
    const backSliverGroup = new THREE.Group();
    scene.add(backSliverGroup);
    backSliverGroup.visible = false;

    // Raycaster & Pointer
    const raycaster = new THREE.Raycaster();
    const mouseNorm = new THREE.Vector2(-999, -999); // -1 to +1
    const mousePx = new THREE.Vector2(-999, -999);
    let isPointerInside = false;

    // Dimension helpers
    let blockWidth = 0;
    let blockHeight = 0;
    let S = 1;
    let navHeight = 0;
    let panelHeight = 0;
    let gap = 14;

    const calcLayoutDimensions = () => {
      viewportW = window.innerWidth;
      viewportH = window.innerHeight;
      const isMobile = viewportW < 768;
      const hMargin = isMobile ? 16 : viewportW * 0.055;
      const vMargin = isMobile ? 16 : viewportH * 0.085;

      blockWidth = Math.max(300, viewportW - hMargin * 2);
      blockHeight = Math.max(360, viewportH - vMargin * 2);
      S = blockWidth / 1730;

      navHeight = blockHeight * 0.108;
      gap = 14 * S;
      panelHeight = blockHeight - navHeight - gap;

      const zDist = (viewportH / 2) / Math.tan((fov * Math.PI) / 360);
      camera.aspect = viewportW / viewportH;
      camera.position.set(0, 0, zDist);
      camera.updateProjectionMatrix();

      renderer.setSize(viewportW, viewportH);
    };
    calcLayoutDimensions();

    // Continuous printed texture canvas
    const artCanvas = document.createElement('canvas');
    const artCtx = artCanvas.getContext('2d');
    const artTexture = new THREE.CanvasTexture(artCanvas);
    artTexture.colorSpace = THREE.SRGBColorSpace;
    artTexture.generateMipmaps = true;
    artTexture.minFilter = THREE.LinearMipmapLinearFilter;

    const updateArtworkTexture = () => {
      if (!artCtx) return;
      const dpr = Math.max(window.devicePixelRatio || 1, 1.5);
      const cw = Math.round(blockWidth * dpr);
      const ch = Math.round(panelHeight * dpr);

      if (artCanvas.width !== cw || artCanvas.height !== ch) {
        artCanvas.width = cw;
        artCanvas.height = ch;
      }

      artCtx.save();
      artCtx.scale(dpr, dpr);
      artCtx.clearRect(0, 0, blockWidth, panelHeight);

      // 17. Eyebrow: REAL-TIME MATERIAL STUDIO
      const eyebrowY = panelHeight * 0.135;
      const eyebrowSize = Math.max(9, Math.round(11 * S));
      artCtx.font = `600 ${eyebrowSize}px Inter, sans-serif`;
      artCtx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      artCtx.letterSpacing = '0.2em';
      artCtx.textBaseline = 'top';
      artCtx.fillText('REAL-TIME MATERIAL STUDIO', blockWidth * 0.045, eyebrowY);

      // 18. Main headline: Designed / in glass.
      const headlineSize = Math.max(
        34,
        Math.min(blockWidth * 0.078, panelHeight * 0.20)
      );
      const headlineY = eyebrowY + eyebrowSize + panelHeight * 0.045;
      artCtx.letterSpacing = '-0.045em';
      artCtx.font = `500 ${headlineSize}px Inter, sans-serif`;
      artCtx.textBaseline = 'top';

      const grad = artCtx.createLinearGradient(0, headlineY, 0, headlineY + headlineSize * 2.1);
      grad.addColorStop(0, '#e4e4e8');
      grad.addColorStop(0.5, '#dcdce0');
      grad.addColorStop(1, '#a6a6ad');
      artCtx.fillStyle = grad;

      const lineHeight = headlineSize * 0.97;
      artCtx.fillText('Designed /', blockWidth * 0.045, headlineY);
      artCtx.fillText('in glass.', blockWidth * 0.045, headlineY + lineHeight);

      // 19. Supporting copy
      const copyY = headlineY + lineHeight * 2 + panelHeight * 0.045;
      const copySize = Math.max(13, Math.round(15 * S));
      artCtx.font = `400 ${copySize}px Inter, sans-serif`;
      artCtx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      artCtx.letterSpacing = '-0.01em';
      artCtx.fillText(
        'Author dispersion, transmission, and refraction in the browser. Live',
        blockWidth * 0.045,
        copyY
      );
      artCtx.fillText(
        'previews, real materials.',
        blockWidth * 0.045,
        copyY + copySize * 1.55
      );

      // 20. Open studio button visual print
      const btnW = 116 * S;
      const btnH = 40 * S;
      const btnX = blockWidth * 0.045;
      const btnY = copyY + copySize * 3.4;

      artCtx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      artCtx.beginPath();
      artCtx.roundRect(btnX, btnY, btnW, btnH, 6 * S);
      artCtx.fill();
      artCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      artCtx.lineWidth = 1;
      artCtx.stroke();

      artCtx.font = `500 ${Math.max(12, Math.round(13 * S))}px Inter, sans-serif`;
      artCtx.fillStyle = '#ffffff';
      artCtx.textBaseline = 'middle';
      artCtx.textAlign = 'center';
      artCtx.fillText('Open studio', btnX + btnW / 2, btnY + btnH / 2);

      // 21. Read paper → button visual print
      const readX = btnX + btnW + 28 * S;
      const readY = btnY + btnH / 2;
      artCtx.textAlign = 'left';
      artCtx.font = `400 ${Math.max(13, Math.round(14 * S))}px Inter, sans-serif`;
      artCtx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      artCtx.fillText('Read paper →', readX, readY);

      // 22. Footer metadata
      const footY = panelHeight - 22 * S;
      const footSize = Math.max(10, Math.round(11 * S));
      artCtx.font = `400 ${footSize}px Inter, sans-serif`;
      artCtx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      artCtx.letterSpacing = '0.04em';
      artCtx.textBaseline = 'bottom';
      artCtx.fillText('© Facet Lab', blockWidth * 0.045, footY);

      artCtx.textAlign = 'right';
      artCtx.fillText('KHR_materials_dispersion', blockWidth - blockWidth * 0.045, footY);

      artCtx.restore();
      artTexture.needsUpdate = true;
    };
    updateArtworkTexture();

    // Nav slab printed canvas
    const navCanvas = document.createElement('canvas');
    const navCtx = navCanvas.getContext('2d');
    const navTexture = new THREE.CanvasTexture(navCanvas);
    navTexture.colorSpace = THREE.SRGBColorSpace;

    const updateNavTexture = () => {
      if (!navCtx) return;
      const dpr = Math.max(window.devicePixelRatio || 1, 1.5);
      const cw = Math.round(blockWidth * dpr);
      const ch = Math.round(navHeight * dpr);

      if (navCanvas.width !== cw || navCanvas.height !== ch) {
        navCanvas.width = cw;
        navCanvas.height = ch;
      }

      navCtx.save();
      navCtx.scale(dpr, dpr);
      navCtx.clearRect(0, 0, blockWidth, navHeight);

      const navMidY = navHeight / 2;

      // Brand: square mark + "Facet"
      const markSize = Math.max(9, Math.round(10 * S));
      const markX = blockWidth * 0.035;
      navCtx.fillStyle = '#ffffff';
      navCtx.fillRect(markX, navMidY - markSize / 2, markSize, markSize);

      navCtx.font = `600 ${Math.max(13, Math.round(15 * S))}px Inter, sans-serif`;
      navCtx.fillStyle = '#ffffff';
      navCtx.textBaseline = 'middle';
      navCtx.textAlign = 'left';
      navCtx.letterSpacing = '-0.02em';
      navCtx.fillText('Facet', markX + markSize + 8 * S, navMidY);

      // Nav links: Studio · Materials · Pricing
      navCtx.font = `400 ${Math.max(12, Math.round(13.5 * S))}px Inter, sans-serif`;
      navCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      navCtx.textAlign = 'center';
      navCtx.letterSpacing = '0.01em';
      navCtx.fillText('Studio   ·   Materials   ·   Pricing', blockWidth / 2, navMidY);

      // Right side: Sign in
      navCtx.textAlign = 'right';
      navCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      navCtx.fillText('Sign in', blockWidth - blockWidth * 0.035, navMidY);

      navCtx.restore();
      navTexture.needsUpdate = true;
    };
    updateNavTexture();

    // Shader cursor glow injection uniform
    const pointerUniforms = {
      uPointerWorld: { value: new THREE.Vector3(0, 0, 0) },
      uGlowIntensity: { value: 0.16 },
      uGlowRadius: { value: 300 * S },
      uIsHovered: { value: 0.0 },
    };

    // Glass Material Factory
    const createGlassMaterial = (opts?: { isNav?: boolean; isBack?: boolean }) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x17171b),
        roughness: 0.36,
        clearcoat: 0.7,
        clearcoatRoughness: 0.12,
        specularIntensity: 0.7,
        iridescence: opts?.isBack ? 0.35 : 0.55,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [250, 650],
        metalness: 0.05,
        envMapIntensity: 0.42,
        transparent: true,
        opacity: 0.98,
      });

      if (!opts?.isBack) {
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uPointerWorld = pointerUniforms.uPointerWorld;
          shader.uniforms.uGlowIntensity = pointerUniforms.uGlowIntensity;
          shader.uniforms.uGlowRadius = pointerUniforms.uGlowRadius;
          shader.uniforms.uIsHovered = pointerUniforms.uIsHovered;

          shader.fragmentShader = `
            uniform vec3 uPointerWorld;
            uniform float uGlowIntensity;
            uniform float uGlowRadius;
            uniform float uIsHovered;
            varying vec3 vWorldPositionCustom;
            ${shader.fragmentShader}
          `;

          shader.vertexShader = `
            varying vec3 vWorldPositionCustom;
            ${shader.vertexShader}
          `.replace(
            `#include <worldpos_vertex>`,
            `#include <worldpos_vertex>
             vWorldPositionCustom = (modelMatrix * vec4(transformed, 1.0)).xyz;`
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `
            float d = length(vWorldPositionCustom - uPointerWorld);
            float glowFactor = exp(-1.6 * pow(d / max(uGlowRadius, 1.0), 2.0));
            vec3 lavenderGlow = vec3(0.42, 0.37, 0.62) * uGlowIntensity * glowFactor * uIsHovered;
            gl_FragColor.rgb += lavenderGlow;
            #include <dithering_fragment>
            `
          );
        };
      }

      return mat;
    };

    // Shard Physics & Transform Definition
    interface ShardInstance {
      id: CellId;
      mesh: THREE.Mesh;
      textMesh: THREE.Mesh;
      group: THREE.Group;
      basePos: THREE.Vector3;
      baseRot: THREE.Euler;
      velocity: THREE.Vector3;
      rotVelocity: THREE.Vector3;
      hoverLift: number;
      hoverTiltX: number;
      hoverTiltY: number;
      targetHoverLift: number;
      targetHoverTiltX: number;
      targetHoverTiltY: number;
      iridescenceVal: number;
      envIntensityVal: number;
      shatterDelay: number;
      reassembleDelay: number;
    }

    const shardInstances: ShardInstance[] = [];

    // Helper to generate rounded polygon shapes using quadratic curves at vertices
    const createRoundedShape = (points: { x: number; y: number }[], radius: number) => {
      const shape = new THREE.Shape();
      const len = points.length;
      if (len < 3) return shape;

      for (let i = 0; i < len; i++) {
        const prev = points[(i - 1 + len) % len];
        const curr = points[i];
        const next = points[(i + 1) % len];

        // Vector from curr to prev
        const d1x = prev.x - curr.x;
        const d1y = prev.y - curr.y;
        const len1 = Math.sqrt(d1x * d1x + d1y * d1y);

        // Vector from curr to next
        const d2x = next.x - curr.x;
        const d2y = next.y - curr.y;
        const len2 = Math.sqrt(d2x * d2x + d2y * d2y);

        const r = Math.min(radius, len1 * 0.45, len2 * 0.45);

        const startX = curr.x + (d1x / len1) * r;
        const startY = curr.y + (d1y / len1) * r;
        const endX = curr.x + (d2x / len2) * r;
        const endY = curr.y + (d2y / len2) * r;

        if (i === 0) {
          shape.moveTo(startX, startY);
        } else {
          shape.lineTo(startX, startY);
        }
        shape.quadraticCurveTo(curr.x, curr.y, endX, endY);
      }
      shape.closePath();
      return shape;
    };

    // Nav slab 3D mesh
    const navGroup = new THREE.Group();
    blockGroup.add(navGroup);

    const cornerR = Math.max(4, 18 * S);
    const extrudeDepth = 13 * S;
    const bevelS = 2.6 * S;

    const navTopLeftX = -blockWidth / 2;
    const navTopLeftY = blockHeight / 2;
    navGroup.position.set(0, navTopLeftY - navHeight / 2, 0);

    const navPoints = [
      { x: -blockWidth / 2, y: navHeight / 2 },
      { x: blockWidth / 2, y: navHeight / 2 },
      { x: blockWidth / 2, y: -navHeight / 2 },
      { x: -blockWidth / 2, y: -navHeight / 2 },
    ];
    const navShape = createRoundedShape(navPoints, cornerR);
    const navGeo = new THREE.ExtrudeGeometry(navShape, {
      depth: extrudeDepth,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: bevelS,
      bevelThickness: bevelS,
    });
    // Center extrusion around z = 0
    navGeo.center();

    const navMat = createGlassMaterial({ isNav: true });
    const navMesh = new THREE.Mesh(navGeo, navMat);
    navMesh.userData = { id: 'nav' };
    navGroup.add(navMesh);

    // Nav text plane attached slightly above top face (z = extrudeDepth/2 + bevelS + 0.5)
    const navTextGeo = new THREE.PlaneGeometry(blockWidth, navHeight);
    const navTextMat = new THREE.MeshBasicMaterial({
      map: navTexture,
      transparent: true,
      opacity: 0.99,
      depthWrite: false,
    });
    const navTextMesh = new THREE.Mesh(navTextGeo, navTextMat);
    navTextMesh.position.set(0, 0, extrudeDepth / 2 + bevelS + 0.6);
    navGroup.add(navTextMesh);

    const navInstance: ShardInstance = {
      id: 'nav',
      mesh: navMesh,
      textMesh: navTextMesh,
      group: navGroup,
      basePos: navGroup.position.clone(),
      baseRot: navGroup.rotation.clone(),
      velocity: new THREE.Vector3(0, 0, 0),
      rotVelocity: new THREE.Vector3(-0.8, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.8),
      hoverLift: 0,
      hoverTiltX: 0,
      hoverTiltY: 0,
      targetHoverLift: 0,
      targetHoverTiltX: 0,
      targetHoverTiltY: 0,
      iridescenceVal: 0.55,
      envIntensityVal: 0.42,
      shatterDelay: 0, // Nav flies first
      reassembleDelay: 0, // Nav restores first
    };
    shardInstances.push(navInstance);

    // 12. Shard Panel Cells A, B, C, D, E definitions
    // Edge points
    const topEdges = [0.22, 0.515, 0.84];
    const btmEdges = [0.34, 0.865];

    // Inner Junctions
    const J0_BASE = { x: 0.385, y: 0.72 };
    const J1_BASE = { x: 0.48, y: 0.62 };
    const J2_BASE = { x: 0.716, y: 0.49 };

    // Shard Panel Group
    const panelGroup = new THREE.Group();
    const panelCenterY = -blockHeight / 2 + panelHeight / 2;
    panelGroup.position.set(0, panelCenterY, 0);
    blockGroup.add(panelGroup);

    // Shard meshes references
    interface CellMeshRef {
      id: CellId;
      group: THREE.Group;
      glassMesh: THREE.Mesh;
      textMesh: THREE.Mesh;
      instance: ShardInstance;
    }
    const cellMeshRefs: CellMeshRef[] = [];

    const cellIds: CellId[] = ['A', 'B', 'C', 'D', 'E'];
    const cellDelays: Record<CellId, { shatter: number; reassemble: number; rotVel: THREE.Vector3 }> = {
      nav: { shatter: 0, reassemble: 0, rotVel: new THREE.Vector3() },
      A: {
        shatter: 0.04,
        reassemble: 0.03,
        rotVel: new THREE.Vector3(-1.8, -1.2, 0.9),
      },
      B: {
        shatter: 0.08,
        reassemble: 0.06,
        rotVel: new THREE.Vector3(1.4, -1.6, -1.1),
      },
      C: {
        shatter: 0.12,
        reassemble: 0.09,
        rotVel: new THREE.Vector3(1.9, 1.3, -1.4),
      },
      D: {
        shatter: 0.16,
        reassemble: 0.12,
        rotVel: new THREE.Vector3(-1.5, 1.8, 1.2),
      },
      E: {
        shatter: 0.20,
        reassemble: 0.15,
        rotVel: new THREE.Vector3(2.2, -1.1, 1.5),
      },
    };

    cellIds.forEach((id) => {
      const cGroup = new THREE.Group();
      panelGroup.add(cGroup);

      const glassMat = createGlassMaterial();
      const glassMesh = new THREE.Mesh(new THREE.BufferGeometry(), glassMat);
      glassMesh.userData = { id };
      cGroup.add(glassMesh);

      const textMat = new THREE.MeshBasicMaterial({
        map: artTexture,
        transparent: true,
        opacity: 0.99,
        depthWrite: false,
      });
      const textMesh = new THREE.Mesh(new THREE.BufferGeometry(), textMat);
      textMesh.userData = { id };
      cGroup.add(textMesh);

      const inst: ShardInstance = {
        id,
        mesh: glassMesh,
        textMesh,
        group: cGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        rotVelocity: cellDelays[id].rotVel,
        hoverLift: 0,
        hoverTiltX: 0,
        hoverTiltY: 0,
        targetHoverLift: 0,
        targetHoverTiltX: 0,
        targetHoverTiltY: 0,
        iridescenceVal: 0.55,
        envIntensityVal: 0.42,
        shatterDelay: cellDelays[id].shatter,
        reassembleDelay: cellDelays[id].reassemble,
      };
      shardInstances.push(inst);
      cellMeshRefs.push({ id, group: cGroup, glassMesh, textMesh, instance: inst });
    });

    // 31. Back Sliver Creation
    const backGroup = backSliverGroup;
    const backPointsNorm = [
      { x: 0.147, y: 0.243 },
      { x: 0.252, y: 0.169 },
      { x: 0.287, y: 0.277 },
      { x: 0.151, y: 0.258 },
    ];
    // Convert to centered coords
    const kScale = viewportW / 1918;
    const backPointsWorld = backPointsNorm.map((p) => ({
      x: (p.x - 0.5) * viewportW,
      y: (0.5 - p.y) * viewportH,
    }));

    // Center of back sliver
    const backCenter = backPointsWorld.reduce(
      (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }),
      { x: 0, y: 0 }
    );

    const backLocalPoints = backPointsWorld.map((p) => ({
      x: p.x - backCenter.x,
      y: p.y - backCenter.y,
    }));

    const backShape = createRoundedShape(backLocalPoints, 6 * kScale);
    const backGeo = new THREE.ExtrudeGeometry(backShape, {
      depth: 11 * kScale,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 2.2 * kScale,
      bevelThickness: 2.2 * kScale,
    });
    backGeo.center();

    const backMat = createGlassMaterial({ isBack: true });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    backMesh.userData = { id: 'back' };
    backGroup.add(backMesh);
    backGroup.position.set(backCenter.x, backCenter.y, 40);
    backGroup.rotation.set(0.08, -0.16, 0);

    // 15. Geometry rebuilding (throttled at ~45Hz / every 22ms)
    let lastRebuildTime = 0;
    const rebuildGeometry = (timeSec: number) => {
      // 13. Organic cut-line drift (10-20s periods)
      const t = timeSec;
      const driftT0 = topEdges[0] + Math.sin(t * 0.45) * 0.025;
      const driftT1 = topEdges[1] + Math.sin(t * 0.38 + 1.2) * 0.028;
      const driftT2 = topEdges[2] + Math.sin(t * 0.41 + 2.4) * 0.026;

      const driftB0 = btmEdges[0] + Math.sin(t * 0.35 + 3.1) * 0.028;
      const driftB1 = btmEdges[1] + Math.sin(t * 0.42 + 4.0) * 0.025;

      let j0x = J0_BASE.x + Math.sin(t * 0.32 + 0.5) * 0.028;
      let j0y = J0_BASE.y + Math.cos(t * 0.28 + 1.1) * 0.045;

      let j1x = J1_BASE.x + Math.sin(t * 0.36 + 2.1) * 0.027;
      let j1y = J1_BASE.y + Math.cos(t * 0.31 + 3.2) * 0.042;

      let j2x = J2_BASE.x + Math.sin(t * 0.39 + 4.5) * 0.026;
      let j2y = J2_BASE.y + Math.cos(t * 0.34 + 5.1) * 0.044;

      // 14. Cursor-driven geometry push
      if (isPointerInside) {
        // Pointer normalized inside panel coordinates (0 to 1, x right, y down)
        // panel in screen coords:
        const panelScreenX = (viewportW - blockWidth) / 2;
        const panelScreenY = (viewportH - blockHeight) / 2 + navHeight + gap;
        const pNormX = (mousePx.x - panelScreenX) / blockWidth;
        const pNormY = (mousePx.y - panelScreenY) / panelHeight;

        const pushPoint = (px: number, py: number) => {
          const dx = px - pNormX;
          const dy = py - pNormY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.6 && dist > 0.001) {
            const force = (1 - dist / 0.6) * 0.05;
            return {
              x: px + (dx / dist) * force,
              y: py + (dy / dist) * force,
            };
          }
          return { x: px, y: py };
        };

        const pj0 = pushPoint(j0x, j0y);
        j0x = pj0.x;
        j0y = pj0.y;

        const pj1 = pushPoint(j1x, j1y);
        j1x = pj1.x;
        j1y = pj1.y;

        const pj2 = pushPoint(j2x, j2y);
        j2x = pj2.x;
        j2y = pj2.y;
      }

      // Convert normalized (0..1, x right, y down) to Panel coordinates centered at (0,0)
      // Panel top-left is (-blockWidth/2, panelHeight/2), y is up in Three.js
      const toPanelCoord = (nx: number, ny: number) => ({
        x: (nx - 0.5) * blockWidth,
        y: (0.5 - ny) * panelHeight,
      });

      // Corner points
      const TL = toPanelCoord(0, 0);
      const TR = toPanelCoord(1, 0);
      const BL = toPanelCoord(0, 1);
      const BR = toPanelCoord(1, 1);

      const tAB = toPanelCoord(driftT0, 0);
      const tBC = toPanelCoord(driftT1, 0);
      const tCE = toPanelCoord(driftT2, 0);

      const bAD = toPanelCoord(driftB0, 1);
      const bDE = toPanelCoord(driftB1, 1);

      const J0 = toPanelCoord(j0x, j0y);
      const J1 = toPanelCoord(j1x, j1y);
      const J2 = toPanelCoord(j2x, j2y);

      // Cell Polygons (Order of vertices)
      // Cell A: TL -> tAB -> J0 -> bAD -> BL
      // Cell B: tAB -> tBC -> J1 -> J0
      // Cell C: tBC -> tCE -> J2 -> J1
      // Cell D: J0 -> J1 -> J2 -> bDE -> bAD
      // Cell E: tCE -> TR -> BR -> bDE -> J2
      const rawPolygons: Record<CellId, { x: number; y: number }[]> = {
        nav: [],
        A: [TL, tAB, J0, bAD, BL],
        B: [tAB, tBC, J1, J0],
        C: [tBC, tCE, J2, J1],
        D: [J0, J1, J2, bDE, bAD],
        E: [tCE, TR, BR, bDE, J2],
      };

      // Inset polygons by half gap (7 * S) so neighboring shards remain separated
      const halfGap = (gap / 2);

      cellMeshRefs.forEach(({ id, glassMesh, textMesh, group }) => {
        const poly = rawPolygons[id];
        if (!poly || poly.length < 3) return;

        // Compute centroid
        let cx = 0;
        let cy = 0;
        poly.forEach((pt) => {
          cx += pt.x / poly.length;
          cy += pt.y / poly.length;
        });

        // Inset points slightly toward centroid
        const insetPoints = poly.map((pt) => {
          const dx = cx - pt.x;
          const dy = cy - pt.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < halfGap) return pt;
          return {
            x: pt.x + (dx / len) * halfGap,
            y: pt.y + (dy / len) * halfGap,
          };
        });

        // Shape for extrusion centered around local origin (cx, cy)
        const localPoints = insetPoints.map((pt) => ({
          x: pt.x - cx,
          y: pt.y - cy,
        }));

        // Dispose old geometries cleanly
        if (glassMesh.geometry) glassMesh.geometry.dispose();
        if (textMesh.geometry) textMesh.geometry.dispose();

        const shardShape = createRoundedShape(localPoints, Math.max(3, 14 * S));
        const shardGeo = new THREE.ExtrudeGeometry(shardShape, {
          depth: extrudeDepth,
          bevelEnabled: true,
          bevelSegments: 3,
          bevelSize: bevelS,
          bevelThickness: bevelS,
        });
        shardGeo.center();
        glassMesh.geometry = shardGeo;

        // Text slice geometry: ShapeGeometry mapped to continuous UVs
        const shapeGeo = new THREE.ShapeGeometry(shardShape);
        // Map UVs to the original page panel position
        const uvAttr = shapeGeo.attributes.uv;
        const posAttr = shapeGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const px = posAttr.getX(i) + cx;
          const py = posAttr.getY(i) + cy;
          // UV: 0..1 from panel (-blockWidth/2 .. blockWidth/2, -panelHeight/2 .. panelHeight/2)
          const u = (px + blockWidth / 2) / blockWidth;
          const v = (py + panelHeight / 2) / panelHeight;
          uvAttr.setXY(i, u, v);
        }
        uvAttr.needsUpdate = true;
        textMesh.geometry = shapeGeo;
        textMesh.position.set(0, 0, extrudeDepth / 2 + bevelS + 0.6);

        // Position cell group at centroid
        group.position.set(cx, cy, 0);
      });
    };

    // Initial rebuild
    rebuildGeometry(0);

    // 24. Homography Calculation for DOM layer synchronization
    const updateDomHomography = (rotX: number, rotY: number) => {
      if (!domLayerRef.current) return;
      // Project the block coordinates with current tilt
      // The CSS transform: perspective(cameraZ px) rotateX(rotX rad) rotateY(rotY rad)
      const degX = (rotX * 180) / Math.PI;
      const degY = (rotY * 180) / Math.PI;
      domLayerRef.current.style.transform = `perspective(${cameraZ}px) rotateX(${degX}deg) rotateY(${degY}deg)`;
    };

    // Pointer Event Listeners
    const handlePointerMove = (e: PointerEvent) => {
      isPointerInside = true;
      mousePx.set(e.clientX, e.clientY);
      mouseNorm.set(
        (e.clientX / viewportW) * 2 - 1,
        -(e.clientY / viewportH) * 2 + 1
      );

      // Raycast against glass meshes
      raycaster.setFromCamera(mouseNorm, camera);
      const meshesToTest = shardInstances.map((s) => s.mesh);
      if (backSliverGroup.visible) meshesToTest.push(backMesh);

      const intersects = raycaster.intersectObjects(meshesToTest, false);
      let hoveredId: string | null = null;
      let intersectPt: THREE.Vector3 | null = null;

      if (intersects.length > 0) {
        hoveredId = intersects[0].object.userData.id;
        intersectPt = intersects[0].point;
      }

      // Update shader pointer uniform
      if (intersectPt) {
        pointerUniforms.uPointerWorld.value.copy(intersectPt);
        pointerUniforms.uIsHovered.value = 1.0;
      } else {
        pointerUniforms.uIsHovered.value = 0.0;
      }

      // 26. Shard Hover Reaction: Lift, tip, iridescence
      shardInstances.forEach((inst) => {
        if (inst.id === hoveredId) {
          const maxLift = inst.id === 'nav' ? 32 * S : 50 * S;
          inst.targetHoverLift = maxLift;
          inst.targetHoverTiltX = 0.12 * Math.sign(mouseNorm.y);
          inst.targetHoverTiltY = -0.12 * Math.sign(mouseNorm.x);
          inst.iridescenceVal = 1.0;
          inst.envIntensityVal = 1.9;
        } else {
          inst.targetHoverLift = 0;
          inst.targetHoverTiltX = 0;
          inst.targetHoverTiltY = 0;
          inst.iridescenceVal = 0.55;
          inst.envIntensityVal = 0.42;
        }
      });
    };

    const handlePointerLeave = () => {
      isPointerInside = false;
      mouseNorm.set(-999, -999);
      pointerUniforms.uIsHovered.value = 0.0;
      shardInstances.forEach((inst) => {
        inst.targetHoverLift = 0;
        inst.targetHoverTiltX = 0;
        inst.targetHoverTiltY = 0;
        inst.iridescenceVal = 0.55;
        inst.envIntensityVal = 0.42;
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      calcLayoutDimensions();
      updateArtworkTexture();
      updateNavTexture();
      rebuildGeometry(performance.now() * 0.001);
    });
    resizeObserver.observe(container);

    // Physics & State tracking variables
    let currentSlabRotX = 0;
    let currentSlabRotY = 0;
    let introProgress = reducedMotion ? 1.0 : 0.0;
    let transitionProgress = 0.0;
    let lastTime = performance.now();

    // Setup initial fly-in positions for shard instances
    if (!reducedMotion) {
      shardInstances.forEach((inst, idx) => {
        const spreadX = (Math.random() - 0.5) * 600 * S;
        const spreadY = (Math.random() - 0.5) * 500 * S;
        const spreadZ = 700 * S + idx * 60 * S;
        inst.group.position.set(spreadX, spreadY, spreadZ);
        inst.group.rotation.set(
          (Math.random() - 0.5) * 2.5,
          (Math.random() - 0.5) * 2.5,
          (Math.random() - 0.5) * 2.0
        );
      });
    }

    // Main Render Loop
    const renderLoop = (now: number) => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(renderLoop);

      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const timeSec = now * 0.001;

      // 15. Geometry rebuilding throttled to ~45 times per second
      if (now - lastRebuildTime > 22 && stateRef.current === 'interactive') {
        rebuildGeometry(timeSec);
        lastRebuildTime = now;
      }

      // 25. Global Pointer Tilt
      // rotateY = x * 7 deg - 1.2 deg; rotateX = -y * 5.5 deg + 0.8 deg
      let targetRotY = 0;
      let targetRotX = 0;
      if (isPointerInside && stateRef.current === 'interactive') {
        const degToRad = Math.PI / 180;
        targetRotY = mouseNorm.x * 7 * degToRad - 1.2 * degToRad;
        targetRotX = -mouseNorm.y * 5.5 * degToRad + 0.8 * degToRad;
      }
      // 0.3s exponential smoothing: factor = 1 - exp(-dt / 0.3)
      const smoothFactor = 1 - Math.exp(-dt / 0.3);
      currentSlabRotX += (targetRotX - currentSlabRotX) * smoothFactor;
      currentSlabRotY += (targetRotY - currentSlabRotY) * smoothFactor;

      blockGroup.rotation.x = currentSlabRotX;
      blockGroup.rotation.y = currentSlabRotY;
      updateDomHomography(currentSlabRotX, currentSlabRotY);

      // State Transitions & Physics
      const state = stateRef.current;

      // INTRO STATE: fly-in reassembly
      if (state === 'intro') {
        introProgress += dt / 0.85;
        if (introProgress >= 1.0) {
          introProgress = 1.0;
          updateState('interactive');
        }
        const tEase = Math.min(1, introProgress);
        // ease-out-back
        const c1 = 1.4;
        const c3 = c1 + 1;
        const easeVal = 1 + c3 * Math.pow(tEase - 1, 3) + c1 * Math.pow(tEase - 1, 2);

        shardInstances.forEach((inst) => {
          inst.group.position.lerp(new THREE.Vector3(0, inst.id === 'nav' ? navTopLeftY - navHeight / 2 : panelCenterY, 0), easeVal);
          inst.group.rotation.x *= 0.92;
          inst.group.rotation.y *= 0.92;
          inst.group.rotation.z *= 0.92;
        });
      }

      // INTERACTIVE STATE: hover spring response
      if (state === 'interactive') {
        // Spring physics: k = 170, c = 19
        const kSpring = 170;
        const cDamping = 19;
        shardInstances.forEach((inst) => {
          // Spring for Lift
          const forceZ = kSpring * (inst.targetHoverLift - inst.hoverLift) - cDamping * inst.velocity.z;
          inst.velocity.z += forceZ * dt;
          inst.hoverLift += inst.velocity.z * dt;

          // Damped interpolation for tip
          inst.hoverTiltX += (inst.targetHoverTiltX - inst.hoverTiltX) * 0.18;
          inst.hoverTiltY += (inst.targetHoverTiltY - inst.hoverTiltY) * 0.18;

          // Material sheen transition
          const mat = inst.mesh.material as THREE.MeshPhysicalMaterial;
          mat.iridescence = THREE.MathUtils.lerp(mat.iridescence, inst.iridescenceVal, 0.15);
          mat.envMapIntensity = THREE.MathUtils.lerp(mat.envMapIntensity, inst.envIntensityVal, 0.15);

          // Apply local transform
          inst.mesh.position.z = inst.hoverLift;
          inst.mesh.rotation.x = inst.hoverTiltX;
          inst.mesh.rotation.y = inst.hoverTiltY;

          inst.textMesh.position.z = extrudeDepth / 2 + bevelS + 0.6 + inst.hoverLift;
          inst.textMesh.rotation.x = inst.hoverTiltX;
          inst.textMesh.rotation.y = inst.hoverTiltY;
        });
      }

      // SHATTERING STATE
      if (state === 'shattering') {
        transitionProgress += dt;
        const totalDuration = 0.72;

        shardInstances.forEach((inst) => {
          const pieceTime = Math.max(0, transitionProgress - inst.shatterDelay);
          if (pieceTime > 0) {
            // Cubic ease-in acceleration
            const progress = Math.min(pieceTime / totalDuration, 1.0);
            const easeIn = progress * progress * progress;

            // Outward + downward + camera-direction impulse
            const camSpeed = (420 + Math.random() * 380) * S;
            const downGravity = 900 * S * easeIn;

            const dirX = inst.id === 'A' ? -350 : inst.id === 'B' ? -120 : inst.id === 'C' ? 140 : inst.id === 'E' ? 400 : 0;
            inst.group.position.x += dirX * S * dt * easeIn * 2;
            inst.group.position.y -= downGravity * dt;
            inst.group.position.z += camSpeed * dt * easeIn * 1.5;

            // Tumble
            inst.group.rotation.x += inst.rotVelocity.x * dt;
            inst.group.rotation.y += inst.rotVelocity.y * dt;
            inst.group.rotation.z += inst.rotVelocity.z * dt;
          }
        });

        // 28. Reveal definitions view after 0.28s
        if (transitionProgress >= 0.28 && !backSliverGroup.visible) {
          backSliverGroup.visible = true;
          backSliverGroup.scale.set(0.01, 0.01, 0.01);
        }

        if (backSliverGroup.visible && backSliverGroup.scale.x < 1.0) {
          const sGrow = Math.min(1.0, backSliverGroup.scale.x + dt * 2.8);
          backSliverGroup.scale.set(sGrow, sGrow, sGrow);
        }

        if (transitionProgress >= totalDuration + 0.2) {
          updateState('definitions');
          transitionProgress = 0;
        }
      }

      // DEFINITIONS STATE: back sliver idle wobble & hover
      if (state === 'definitions') {
        backSliverGroup.visible = true;
        // 33. Slow idle wobble: +-0.03-0.04 rad, ~1Hz
        const wobbleX = 0.08 + Math.sin(timeSec * 2 * Math.PI * 1.0) * 0.035;
        const wobbleY = -0.16 + Math.cos(timeSec * 2 * Math.PI * 0.9) * 0.035;
        const hoverTip = isHoveredBack ? 0.14 : 0;

        backSliverGroup.rotation.x = wobbleX + hoverTip;
        backSliverGroup.rotation.y = wobbleY;
      }

      // REASSEMBLING STATE: reverse shard trajectories
      if (state === 'reassembling') {
        transitionProgress += dt;
        const totalDuration = 0.72;

        // Shrink back sliver
        if (backSliverGroup.scale.x > 0.02) {
          const sShrink = Math.max(0.001, backSliverGroup.scale.x - dt * 3.5);
          backSliverGroup.scale.set(sShrink, sShrink, sShrink);
        } else {
          backSliverGroup.visible = false;
        }

        // Restore shards with 30ms stagger (nav restored first)
        const tEase = Math.min(1.0, transitionProgress / totalDuration);
        const c1 = 1.35;
        const c3 = c1 + 1;
        const easeOutBack = 1 + c3 * Math.pow(tEase - 1, 3) + c1 * Math.pow(tEase - 1, 2);

        shardInstances.forEach((inst) => {
          const pieceTime = Math.max(0, transitionProgress - inst.reassembleDelay);
          const pNorm = Math.min(1.0, pieceTime / totalDuration);
          const pEase = 1 + c3 * Math.pow(pNorm - 1, 3) + c1 * Math.pow(pNorm - 1, 2);

          const targetY = inst.id === 'nav' ? navTopLeftY - navHeight / 2 : panelCenterY;
          inst.group.position.x *= Math.max(0, 1 - pEase * 0.08);
          inst.group.position.y = THREE.MathUtils.lerp(inst.group.position.y, targetY, Math.min(1, pEase * 0.15));
          inst.group.position.z *= Math.max(0, 1 - pEase * 0.12);

          inst.group.rotation.x *= Math.max(0, 1 - pEase * 0.1);
          inst.group.rotation.y *= Math.max(0, 1 - pEase * 0.1);
          inst.group.rotation.z *= Math.max(0, 1 - pEase * 0.1);
        });

        if (transitionProgress >= totalDuration + 0.15) {
          shardInstances.forEach((inst) => {
            const targetY = inst.id === 'nav' ? navTopLeftY - navHeight / 2 : panelCenterY;
            inst.group.position.set(0, targetY, 0);
            inst.group.rotation.set(0, 0, 0);
            inst.mesh.position.set(0, 0, 0);
            inst.mesh.rotation.set(0, 0, 0);
          });
          updateState('interactive');
          transitionProgress = 0;
        }
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    // Cleanup on unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      resizeObserver.disconnect();

      // Dispose Three.js scene objects
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      artTexture.dispose();
      navTexture.dispose();
      renderer.dispose();
    };
  }, [hasWebGL, reducedMotion, updateState, isHoveredBack]);

  // Reduced motion or No-WebGL Static Fallback
  if (!hasWebGL || reducedMotion) {
    return (
      <main className="relative flex h-screen w-screen flex-col items-center justify-between overflow-hidden bg-[#050507] p-4 text-white md:p-8">
        <header className="flex h-14 w-full max-w-6xl items-center justify-between rounded-lg border border-white/10 bg-[#17171b]/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-white"></span>
            <span className="font-semibold tracking-tight text-white">Facet</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-white/60">
            <a href="#studio" className="transition hover:text-white">Studio</a>
            <span className="text-white/20">·</span>
            <a href="#materials" className="transition hover:text-white">Materials</a>
            <span className="text-white/20">·</span>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </nav>
          <button className="text-sm text-white/80 transition hover:text-white">Sign in</button>
        </header>

        {currentState === 'definitions' ? (
          <section className="flex w-full max-w-2xl flex-col gap-6 py-12">
            <button
              onClick={() => updateState('interactive')}
              className="w-fit text-sm font-medium text-[#b9abff] underline underline-offset-4"
            >
              ← Back
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Real-time glass, in five terms.
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-white/60">
              <p><strong className="text-white">Iridescence</strong> — Optical color play caused by thin-film interference at varying angles.</p>
              <p><strong className="text-white">Index of refraction</strong> — Ratio of light speed in vacuum to phase velocity inside the medium.</p>
              <p><strong className="text-white">Dispersion</strong> — Variation of refractive index with wavelength, separating white light into spectral bands.</p>
              <p><strong className="text-white">Transmission</strong> — Fraction of radiant flux passing through physical glass without scattering or absorption.</p>
              <p><strong className="text-white">Roughness</strong> — Micro-surface irregularities determining specular highlight clarity and diffuse spread.</p>
            </div>
          </section>
        ) : (
          <section className="flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 py-8">
            <p className="text-xs font-semibold tracking-[0.2em] text-white/40">
              REAL-TIME MATERIAL STUDIO
            </p>
            <h1 className="text-5xl font-medium tracking-tight text-[#dcdce0] md:text-7xl">
              Designed /<br />in glass.
            </h1>
            <p className="max-w-xl text-base text-white/60">
              Author dispersion, transmission, and refraction in the browser. Live previews, real materials.
            </p>
            <div className="flex items-center gap-6 pt-4">
              <button className="h-10 rounded-md bg-[#36d67e] px-6 text-sm font-medium text-black">
                Open studio
              </button>
              <button
                onClick={() => updateState('definitions')}
                className="text-sm font-medium text-white underline underline-offset-4"
              >
                Read paper →
              </button>
            </div>
          </section>
        )}

        <footer className="flex w-full max-w-6xl items-center justify-between text-xs text-white/35">
          <span>© Facet Lab</span>
          <span>KHR_materials_dispersion</span>
        </footer>
      </main>
    );
  }

  // Full WebGL Experience with Homography-Synchronized Accessible DOM Layer
  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden bg-[#050507] select-none"
    >
      {/* 4. Three.js Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full pointer-events-auto"
      />

      {/* 24. Transparent DOM Accessibility & Interaction Layer */}
      <div
        ref={domLayerRef}
        aria-hidden={currentState === 'definitions'}
        className={`pointer-events-none absolute inset-0 z-10 flex flex-col justify-between transition-opacity duration-300 ${
          currentState === 'interactive' || currentState === 'intro'
            ? 'opacity-100'
            : 'opacity-0'
        }`}
        style={{
          transformOrigin: 'center center',
          padding: '8.5vh 5.5vw',
        }}
      >
        {/* Navigation Slab Interactive Overlay */}
        <header
          className="flex w-full items-center justify-between"
          style={{ height: '10.8%' }}
        >
          <div className="pointer-events-auto flex items-center gap-2 cursor-pointer">
            <span className="h-2.5 w-2.5 bg-transparent" />
            <span className="font-semibold text-transparent select-text">Facet</span>
          </div>
          <nav className="pointer-events-auto flex items-center gap-8 text-sm text-transparent select-text">
            <a
              href="#studio"
              className="cursor-pointer text-transparent hover:text-white/20"
            >
              Studio
            </a>
            <span className="text-transparent">·</span>
            <a
              href="#materials"
              className="cursor-pointer text-transparent hover:text-white/20"
            >
              Materials
            </a>
            <span className="text-transparent">·</span>
            <a
              href="#pricing"
              className="cursor-pointer text-transparent hover:text-white/20"
            >
              Pricing
            </a>
          </nav>
          <button
            className="pointer-events-auto cursor-pointer text-sm text-transparent hover:text-white/20 select-text"
          >
            Sign in
          </button>
        </header>

        {/* Shard Content Interactive Layer */}
        <div className="relative flex flex-1 flex-col justify-between pt-4">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold tracking-[0.2em] text-transparent select-text">
              REAL-TIME MATERIAL STUDIO
            </span>
            <h1 className="text-6xl font-medium tracking-tight text-transparent select-text md:text-8xl">
              Designed /<br />in glass.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-transparent select-text md:text-base">
              Author dispersion, transmission, and refraction in the browser. Live previews, real materials.
            </p>

            <div className="flex items-center gap-6 pt-4">
              <button
                type="button"
                onMouseEnter={() => setIsHoveredOpenStudio(true)}
                onMouseLeave={() => setIsHoveredOpenStudio(false)}
                className="pointer-events-auto cursor-pointer rounded-md border border-transparent px-6 py-2.5 text-sm font-medium text-transparent select-text transition hover:border-[#36d67e]/40 hover:bg-[#36d67e]/10"
                aria-label="Open studio"
              >
                Open studio
              </button>
              <button
                type="button"
                onClick={triggerShatter}
                onMouseEnter={() => setIsHoveredReadPaper(true)}
                onMouseLeave={() => setIsHoveredReadPaper(false)}
                className="pointer-events-auto cursor-pointer text-sm font-medium text-transparent select-text hover:underline hover:decoration-white/50"
                aria-label="Read paper"
              >
                Read paper →
              </button>
            </div>
          </div>

          {/* Footer Metadata */}
          <footer className="flex w-full items-center justify-between text-xs text-transparent select-text">
            <span>© Facet Lab</span>
            <span>KHR_materials_dispersion</span>
          </footer>
        </div>
      </div>

      {/* 28-30. Definitions View Layer */}
      <div
        aria-hidden={currentState !== 'definitions'}
        className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-400 ${
          currentState === 'definitions' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* 34. Back Sliver DOM Hit Area */}
        <button
          ref={backSliverDomRef}
          type="button"
          onClick={triggerBack}
          onMouseEnter={() => setIsHoveredBack(true)}
          onMouseLeave={() => setIsHoveredBack(false)}
          className="pointer-events-auto absolute z-30 cursor-pointer font-medium transition duration-200"
          style={{
            left: '21.9vw',
            top: '23.8vh',
            transform: 'translate(-50%, -50%)',
            fontSize: '0.66vw',
            color: isHoveredBack ? '#b9abff' : '#ffffff',
          }}
          aria-label="Back to studio hero"
        >
          ← Back
        </button>

        {/* 29. Definitions Column */}
        <section
          className="absolute z-20 flex flex-col pointer-events-auto"
          style={{
            left: '32.4vw',
            width: '33.9vw',
            top: '35.9vh',
          }}
        >
          <h2
            className="mb-6 font-semibold tracking-[-0.022em] text-white select-text"
            style={{
              fontSize: '1.36vw',
              fontWeight: 650,
            }}
          >
            Real-time glass, in five terms.
          </h2>

          <div
            className="space-y-4 font-normal text-white/60 select-text"
            style={{
              fontSize: '0.73vw',
              lineHeight: 1.72,
            }}
          >
            <div>
              <strong className="font-semibold text-white">Iridescence</strong>
              {' '}— Optical color play caused by thin-film interference at varying angles.
            </div>
            <div>
              <strong className="font-semibold text-white">Index of refraction</strong>
              {' '}— Ratio of light speed in vacuum to phase velocity inside the medium.
            </div>
            <div>
              <strong className="font-semibold text-white">Dispersion</strong>
              {' '}— Variation of refractive index with wavelength, separating white light into spectral bands.
            </div>
            <div>
              <strong className="font-semibold text-white">Transmission</strong>
              {' '}— Fraction of radiant flux passing through physical glass without scattering or absorption.
            </div>
            <div>
              <strong className="font-semibold text-white">Roughness</strong>
              {' '}— Micro-surface irregularities determining specular highlight clarity and diffuse spread.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
