import os

src_dir = "frontend/src"
os.makedirs(src_dir, exist_ok=True)

with open(os.path.join(src_dir, "App.tsx"), "w") as f:
    f.write('''import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html, Sphere, Box } from '@react-three/drei';
import * as THREE from 'three';

// --- Types ---
type Point = { md: number, x: number, y: number, z: number };
type Well = { well_id: string, is_current: boolean, trajectory: Point[] };
type Formation = { name: string, top: number, bottom: number, color: string };
type Event = { event_id: string, well_id: string, event_type: string, depth: number, formation: string, severity: string, description: string };

// --- 3D Components ---

function WellTrajectory({ well, color, opacity, isCurrent }: { well: Well, color: string, opacity: number, isCurrent: boolean }) {
  const points = well.trajectory.map(p => new THREE.Vector3(p.x, p.z, p.y));
  
  if (points.length < 2) return null;
  
  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={isCurrent ? 5 : 2}
        transparent
        opacity={opacity}
      />
      <Html position={[points[0].x, points[0].y + 10, points[0].z]}>
        <div style={{ color: 'white', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: '3px', fontSize: '10px', whiteSpace: 'nowrap' }}>
          {well.well_id}
        </div>
      </Html>
    </group>
  );
}

function Formations({ formations }: { formations: Formation[] }) {
  return (
    <group>
      {formations.map((f, i) => {
        const height = f.bottom - f.top;
        const yCenter = - (f.top + height / 2); // z is up in our points, wait, in Threejs y is usually up.
        // Let's assume trajectory mapping: x=x, y=-depth, z=y
        
        return (
           <Box key={i} args={[200, height, 200]} position={[0, - (f.top + height/2), 0]}>
             <meshStandardMaterial color={f.color} transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} />
           </Box>
        );
      })}
    </group>
  );
}

function Events({ events, wells, currentDepth }: { events: Event[], wells: Well[], currentDepth: number }) {
  return (
    <group>
      {events.map((evt, i) => {
        if (evt.depth > currentDepth) return null; // Hide future events
        
        const well = wells.find(w => w.well_id === evt.well_id);
        if (!well) return null;
        
        // Find position along trajectory (simplified linear interpolation)
        let pos = new THREE.Vector3(0, -evt.depth, 0);
        for(let j = 0; j < well.trajectory.length - 1; j++) {
           const p1 = well.trajectory[j];
           const p2 = well.trajectory[j+1];
           if (evt.depth >= p1.md && evt.depth <= p2.md) {
               const t = (evt.depth - p1.md) / (p2.md - p1.md);
               pos.set(
                   p1.x + t * (p2.x - p1.x),
                   p1.z + t * (p2.z - p1.z), // y is depth (negative)
                   p1.y + t * (p2.y - p1.y)  // z is y
               );
               break;
           }
        }

        const color = evt.severity === 'high' ? 'red' : 'orange';
        
        return (
          <group key={i} position={pos}>
            <Sphere args={[20, 16, 16]}>
              <meshStandardMaterial color={color} />
            </Sphere>
            <Html>
              <div style={{ color: 'white', background: 'rgba(255,0,0,0.7)', padding: '2px 5px', borderRadius: '3px', fontSize: '10px', whiteSpace: 'nowrap', marginTop: '10px' }}>
                {evt.event_type} ({evt.depth}m)
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function CurrentDepthMarker({ depth, wells }: { depth: number, wells: Well[] }) {
    const currentWell = wells.find(w => w.is_current);
    if (!currentWell) return null;
    
    let pos = new THREE.Vector3(0, -depth, 0);
    // basic lerp
    for(let j = 0; j < currentWell.trajectory.length - 1; j++) {
        const p1 = currentWell.trajectory[j];
        const p2 = currentWell.trajectory[j+1];
        if (depth >= p1.md && depth <= p2.md) {
            const t = (depth - p1.md) / (p2.md - p1.md);
            pos.set(
                p1.x + t * (p2.x - p1.x),
                p1.z + t * (p2.z - p1.z),
                p1.y + t * (p2.y - p1.y)
            );
            break;
        }
    }

    return (
        <group position={pos}>
            <Sphere args={[15, 16, 16]}>
              <meshStandardMaterial color="cyan" />
            </Sphere>
             <Html>
              <div style={{ color: 'cyan', background: 'rgba(0,0,0,0.7)', border: '1px solid cyan', padding: '2px 5px', borderRadius: '3px', fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '20px' }}>
                Drill Bit @ {Math.round(depth)}m
              </div>
            </Html>
        </group>
    );
}

// --- Main App ---

export default function App() {
  const [wells, setWells] = useState<Well[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  
  const [depth, setDepth] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  
  const timerRef = useRef<any>(null);

  // Fetch Data
  useEffect(() => {
    Promise.all([
      fetch('http://localhost:8000/api/nwis3d/wells').then(r => r.json()),
      fetch('http://localhost:8000/api/nwis3d/formations').then(r => r.json()),
      fetch('http://localhost:8000/api/nwis3d/events').then(r => r.json())
    ]).then(([w, f, e]) => {
      setWells(w);
      setFormations(f);
      setEvents(e);
      setDepth(0);
    }).catch(err => console.error(err));
  }, []);

  // Simulation Loop
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setDepth(d => {
          if (d >= 3000) {
            setIsPlaying(false);
            return 3000;
          }
          return d + (10 * speed);
        });
      }, 100); // 10 ticks per second
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying, speed]);

  // Derived state
  const currentFormation = formations.find(f => depth >= f.top && depth <= f.bottom);
  
  // Find visible events and comparable cases based on current depth
  const visibleEvents = events.filter(e => e.depth <= depth);
  const comparableCases = new Set(visibleEvents.map(e => e.well_id)).size;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111', color: '#eee', fontFamily: 'sans-serif' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#00e5ff' }}>NWIS 3D SUBSURFACE INTELLIGENCE</h1>
            <p style={{ margin: 0, color: '#aaa', fontSize: '0.8rem' }}>SIMULATION MODE - SYNTHETIC DEMONSTRATION DATA - NOT LIVE OIL OPERATIONAL DATA</p>
        </div>
      </header>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Canvas camera={{ position: [400, 200, 400], fov: 60 }}>
            <color attach="background" args={['#1e1e1e']} />
            <ambientLight intensity={0.5} />
            <pointLight position={[100, 100, 100]} />
            <OrbitControls target={[0, -1500, 0]} />
            
            <gridHelper args={[1000, 20, '#444', '#222']} position={[0,0,0]} />
            
            <Formations formations={formations} />
            
            {wells.map(w => (
                <WellTrajectory key={w.well_id} well={w} color={w.is_current ? '#00e5ff' : '#aaaaaa'} opacity={w.is_current ? 1 : 0.4} isCurrent={w.is_current} />
            ))}
            
            <Events events={events} wells={wells} currentDepth={depth} />
            
            <CurrentDepthMarker depth={depth} wells={wells} />
          </Canvas>
          
          <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '5px', border: '1px solid #333' }}>
            <p style={{ margin: 0 }}>Wells Loaded: {wells.length}</p>
            <p style={{ margin: 0 }}>Formations: {formations.length}</p>
            <p style={{ margin: 0 }}>Events: {events.length}</p>
          </div>
        </div>
        
        <aside style={{ width: '350px', padding: '1.5rem', borderLeft: '1px solid #333', overflowY: 'auto', background: '#1a1a1a' }}>
          <h2 style={{ fontSize: '1.2rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>CURRENT WELL</h2>
          <div style={{ background: '#222', padding: '1rem', borderRadius: '5px', marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>DEMO-W001</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><span>Depth:</span> <strong>{Math.round(depth)} m</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Formation:</span> <strong style={{color: currentFormation?.color || 'white'}}>{currentFormation?.name || 'Unknown'}</strong></div>
          </div>
          
          <h3 style={{ fontSize: '1rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem', marginTop: '2rem' }}>DATA QUALITY</h3>
          <div style={{ background: '#222', padding: '1rem', borderRadius: '5px', marginBottom: '1rem' }}>
              <p style={{ margin: '0 0 5px 0', color: '#4caf50', display: 'flex', alignItems: 'center', gap: '5px' }}>✓ Depth</p>
              <p style={{ margin: '0 0 5px 0', color: '#4caf50', display: 'flex', alignItems: 'center', gap: '5px' }}>✓ Formation</p>
              <p style={{ margin: '0 0 5px 0', color: '#4caf50', display: 'flex', alignItems: 'center', gap: '5px' }}>✓ Historical</p>
              <hr style={{ borderColor: '#444' }} />
              <p style={{ margin: '5px 0 0 0', color: '#81c784', fontWeight: 'bold' }}>SUFFICIENT FOR DEMONSTRATION</p>
          </div>
          
          <h3 style={{ fontSize: '1rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem', marginTop: '2rem' }}>CONTEXTUAL EARLY WARNING</h3>
          <div style={{ background: comparableCases > 0 ? '#3a2a1a' : '#222', border: comparableCases > 0 ? '1px solid orange' : '1px solid #444', padding: '1rem', borderRadius: '5px', marginBottom: '1rem' }}>
              {comparableCases > 0 ? (
                  <>
                      <p style={{ margin: '0 0 10px 0', color: 'orange', fontWeight: 'bold' }}>⚠️ POTENTIAL ABNORMAL PATTERN</p>
                      <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}>Current Interval: {Math.max(0, depth-30)}m - {depth}m</p>
                      <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}>Historical context: <strong>{comparableCases} comparable cases</strong></p>
                      <button style={{ marginTop: '10px', background: 'orange', color: '#111', border: 'none', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>SHOW ME WHY</button>
                  </>
              ) : (
                  <p style={{ margin: 0, color: '#aaa' }}>No comparable anomalies detected.</p>
              )}
          </div>
        </aside>
      </div>
      
      <footer style={{ padding: '1rem 2rem', borderTop: '1px solid #333', background: '#0a0a0a', display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ minWidth: '40px' }}>{Math.round(depth)}m</span>
            <input 
                type="range" 
                min="0" max="3000" 
                value={depth} 
                onChange={(e) => setDepth(Number(e.target.value))} 
                style={{ flex: 1, cursor: 'pointer' }} 
            />
            <span>3000m</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setDepth(d => Math.max(0, d - 50))} style={{ padding: '8px 15px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>◀ STEP</button>
            <button onClick={() => setIsPlaying(!isPlaying)} style={{ padding: '8px 20px', background: isPlaying ? '#ff4444' : '#00e5ff', color: isPlaying ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isPlaying ? 'PAUSE' : '▶ PLAY'}
            </button>
            <button onClick={() => { setIsPlaying(false); setDepth(0); }} style={{ padding: '8px 15px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>RESET</button>
        </div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <span style={{ marginRight: '5px', color: '#aaa' }}>SPEED:</span>
            {[1, 5, 10].map(s => (
                <button key={s} onClick={() => setSpeed(s)} style={{ padding: '5px 10px', background: speed === s ? '#555' : '#222', color: 'white', border: '1px solid #444', borderRadius: '3px', cursor: 'pointer' }}>{s}x</button>
            ))}
        </div>
      </footer>
    </div>
  );
}
''')

print("Frontend App.tsx updated with full 3D implementation.")
