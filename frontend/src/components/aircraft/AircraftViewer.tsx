import { Suspense, useRef, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";

function ProceduralAircraft() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
  });
  return (
    <group ref={group} position={[0, 0.3, 0]}>
      {/* Fuselage */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.22, 3.2, 32]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Nose */}
      <mesh position={[1.7, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.18, 0.6, 32]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Cockpit */}
      <mesh position={[1.2, 0.12, 0]}>
        <sphereGeometry args={[0.16, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#0ea5e9" metalness={0.6} roughness={0.2} transparent opacity={0.85} />
      </mesh>
      {/* Wings */}
      <mesh position={[0.1, -0.05, 0]}>
        <boxGeometry args={[0.9, 0.05, 1.8]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Tail vertical */}
      <mesh position={[-1.4, 0.35, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.04]} />
        <meshStandardMaterial color="#7c3aed" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Tail horizontal */}
      <mesh position={[-1.4, 0.05, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.8]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Engines */}
      <mesh position={[0, -0.08, 0.45]}>
        <cylinderGeometry args={[0.09, 0.09, 0.5, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.08, -0.45]}>
        <cylinderGeometry args={[0.09, 0.09, 0.5, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

function A320neoModel() {
  const { scene } = useGLTF("/models/a320neo.glb");
  const groupRef = useRef<THREE.Group>(null);

  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    // Target max dimension ~3 units to match previous procedural scale and fit viewer
    const scale = maxDim > 0 ? 3.0 / maxDim : 1;
    clone.scale.setScalar(scale);
    // Center at origin after scaling
    clone.position.sub(center.clone().multiplyScalar(scale));
    // Lift slightly so lowest point sits just above grid (grid at y=-0.5)
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const yOffset = -scaledBox.min.y - 0.4;
    clone.position.y += yOffset;
    return clone;
  }, [scene]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload("/models/a320neo.glb");

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[AircraftViewer] A320neo GLB failed, falling back to procedural:", error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) return this.props.fallback as ReactNode;
    return this.props.children;
  }
}

function Fallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#7c3aed" />
    </mesh>
  );
}

export function AircraftViewer() {
  return (
    <div className="h-[420px] w-full rounded-xl border bg-gradient-to-b from-background to-muted/20 overflow-hidden relative">
      <Canvas camera={{ position: [4, 2.5, 4], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, 3, -5]} intensity={0.5} />
        <Suspense fallback={<Fallback />}>
          <ModelErrorBoundary fallback={<ProceduralAircraft />}>
            <A320neoModel />
          </ModelErrorBoundary>
          <Grid position={[0, -0.5, 0]} args={[10, 10]} cellSize={0.5} cellThickness={1} cellColor="#e5e7eb" sectionSize={2} sectionThickness={1} sectionColor="#d1d5db" fadeDistance={12} />
          <Environment preset="city" />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={2} maxDistance={10} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.2} target={[0, 0.2, 0]} />
      </Canvas>
      <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center pointer-events-none">
        <span className="text-[11px] bg-background/80 backdrop-blur rounded-md px-2 py-1 border">Drag to rotate • Scroll to zoom • Right-drag to pan</span>
        <span className="text-[10px] bg-background/80 backdrop-blur rounded-md px-2 py-1 border hidden sm:inline">A320neo • CC-BY 4.0 pranav27</span>
      </div>
    </div>
  );
}
