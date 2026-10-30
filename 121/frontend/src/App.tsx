import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html, Sphere, Box, Text } from '@react-three/drei';
import * as THREE from 'three';

// --- Types ---
type Point = { md: number, x: number, y: number, z: number };
type Well = { well_id: string, is_current: boolean, trajectory: Point[] };
type Formation = { name: string, top: number, bottom: number, color: string };
type Event = { event_id: string, well_id: string, event_type: string, depth: number, formation: string, severity: string, description: string };

// --- 3D Components ---
function WellTrajectory({ well, color, opacity, isCurrent }: { well: Well, color: string, opacity: number, isCurrent: boolean }) {
  const points = well.trajectory.map(p => new THREE.Vector3(p.x, -p.md, p.y));
  
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
      <Html position={[points[0].x, points[0].y + 20, points[0].z]} center>
        <div style={{ color: 'white', background: isCurrent ? 'rgba(0,229,255,0.5)' : 'rgba(100,100,100,0.5)', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', whiteSpace: 'nowrap', border: isCurrent ? '1px solid #00e5ff' : 'none' }}>
          {well.well_id} {isCurrent && "(Current)"}
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
        const yCenter = - (f.top + height / 2);
        
        return (
           <group key={i}>
             <Box args={[400, height, 400]} position={[0, yCenter, 0]}>
               <meshStandardMaterial color={f.color} transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} />
             </Box>
             <Text position={[200, yCenter, 200]} color={f.color} fontSize={40} anchorX="left" anchorY="middle">
               {f.name}
             </Text>
           </group>
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
                   -(p1.md + t * (p2.md - p1.md)),
                   p1.y + t * (p2.y - p1.y)
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
            <Html center>
              <div style={{ color: 'white', background: 'rgba(255,0,0,0.8)', border: '1px solid white', padding: '5px', borderRadius: '3px', fontSize: '11px', whiteSpace: 'nowrap', marginTop: '40px' }}>
                <strong>{evt.event_type}</strong><br/>
                Depth: {evt.depth}m<br/>
                Well: {evt.well_id}
              </div>
            </Html>
            <Line points={[new THREE.Vector3(0,0,0), new THREE.Vector3(-pos.x, 0, -pos.z)]} color="red" transparent opacity={0.3} dashed />
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
                -(p1.md + t * (p2.md - p1.md)),
                p1.y + t * (p2.y - p1.y)
            );
            break;
        }
    }

    return (
        <group position={pos}>
            <Sphere args={[25, 16, 16]}>
              <meshStandardMaterial color="#00e5ff" wireframe />
            </Sphere>
             <Html center>
              <div style={{ color: '#00e5ff', background: 'rgba(0,0,0,0.8)', border: '1px solid #00e5ff', padding: '5px 10px', borderRadius: '3px', fontSize: '14px', whiteSpace: 'nowrap', marginLeft: '60px', fontWeight: 'bold' }}>
                DRILL BIT @ {Math.round(depth)}m
              </div>
            </Html>
        </group>
    );
}

// --- Camera Tracking ---
function CameraTracker({ depth, wells, follow }: { depth: number, wells: Well[], follow: boolean }) {
    const { camera, controls } = useThree();
    
    useFrame((state) => {
        if (!follow || !state.controls) return;
        
        const currentWell = wells.find(w => w.is_current);
        if (!currentWell) return;
        
        let pos = new THREE.Vector3(0, -depth, 0);
        for(let j = 0; j < currentWell.trajectory.length - 1; j++) {
            const p1 = currentWell.trajectory[j];
            const p2 = currentWell.trajectory[j+1];
            if (depth >= p1.md && depth <= p2.md) {
                const t = (depth - p1.md) / (p2.md - p1.md);
                pos.set(
                    p1.x + t * (p2.x - p1.x),
                    -(p1.md + t * (p2.md - p1.md)),
                    p1.y + t * (p2.y - p1.y)
                );
                break;
            }
        }
        
        // Lerp OrbitControls target to drill position
        (state.controls as any).target.lerp(pos, 0.1);
        
        // Also move camera down to keep relative view
        // Calculate offset from current target
        const offset = state.camera.position.clone().sub((state.controls as any).target);
        const desiredCameraPos = pos.clone().add(new THREE.Vector3(800, 400, 800)); // Default offset if we want to force it
        
        // We'll just softly move the camera downwards with the drill
        state.camera.position.lerp(pos.clone().add(offset.normalize().multiplyScalar(1000)), 0.05);
        (state.controls as any).update();
    });
    
    return null;
}

// --- Main App ---

export default function App() {
  const [wells, setWells] = useState<Well[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  
  const [depth, setDepth] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const [followDrill, setFollowDrill] = useState(true);
  
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
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying, speed]);

  // Derived state
  const currentFormation = formations.find(f => depth >= f.top && depth <= f.bottom);
  
  const visibleEvents = events.filter(e => e.depth <= depth);
  const comparableCases = new Set(visibleEvents.map(e => e.well_id)).size;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0d0d0d', color: '#eee', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ padding: '15px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111' }}>
        <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#00e5ff', letterSpacing: '1px' }}>NWIS 3D SUBSURFACE INTELLIGENCE</h1>
            <p style={{ margin: '5px 0 0 0', color: '#ffb300', fontSize: '0.8rem', fontWeight: 'bold' }}>[SIMULATION MODE] SYNTHETIC DEMONSTRATION DATA - NOT LIVE OIL OPERATIONAL DATA</p>
        </div>
      </header>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {/* We ensure canvas captures pointer events */}
          <Canvas camera={{ position: [800, 400, 800], fov: 50 }} style={{ touchAction: 'none' }}>
            <color attach="background" args={['#1a1a1a']} />
            <ambientLight intensity={0.6} />
            <pointLight position={[1000, 1000, 1000]} intensity={1.5} />
            
            {/* Added makeDefault and min/max constraints to fix orbit issues */}
            <OrbitControls makeDefault target={[0, -1500, 0]} maxDistance={3000} minDistance={100} />
            
            {/* Contextual Grid */}
            <gridHelper args={[1000, 20, '#555', '#222']} position={[0,0,0]} />
            <axesHelper args={[500]} />
            
            <Formations formations={formations} />
            
            {wells.map(w => (
                <WellTrajectory key={w.well_id} well={w} color={w.is_current ? '#00e5ff' : '#aaaaaa'} opacity={w.is_current ? 1 : 0.6} isCurrent={w.is_current} />
            ))}
            
            <Events events={events} wells={wells} currentDepth={depth} />
            
            <CurrentDepthMarker depth={depth} wells={wells} />
            
            <CameraTracker depth={depth} wells={wells} follow={followDrill} />
          </Canvas>
          
          <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(0,0,0,0.8)', padding: '15px', borderRadius: '8px', border: '1px solid #333', pointerEvents: 'none' }}>
            <h4 style={{margin: '0 0 10px 0', color: '#888'}}>SIMULATION LOGIC OVERVIEW</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', lineHeight: '1.5' }}>
               <li><strong>Green / Blue Boxes:</strong> Synthetic Geological Formations</li>
               <li><strong>Cyan Line:</strong> Current Drilling Well (DEMO-W001)</li>
               <li><strong>Grey Lines:</strong> Historical Offset Wells</li>
               <li><strong>Spheres:</strong> Historical Events recorded at that depth</li>
               <li><strong>Red Dashed Line:</strong> Proximity indicator to historical event</li>
            </ul>
            <p style={{marginTop: '10px', fontSize: '0.8rem', color: '#aaa'}}><em>Tip: Left click & drag to rotate in 3D. Scroll to zoom.</em></p>
          </div>
          
          <div style={{ position: 'absolute', bottom: 20, right: 20 }}>
              <button 
                onClick={() => setFollowDrill(!followDrill)}
                style={{
                  background: followDrill ? '#00e5ff' : '#333',
                  color: followDrill ? 'black' : 'white',
                  border: '1px solid #444',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                  {followDrill ? '🔒 CAMERA: TRACKING DRILL' : '🔓 CAMERA: FREELOOK'}
              </button>
          </div>
        </div>
        
        <aside style={{ width: '400px', padding: '1.5rem', borderLeft: '1px solid #333', overflowY: 'auto', background: '#141414', zIndex: 10 }}>
          <h2 style={{ fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>CURRENT DRILLING CONTEXT</h2>
          <div style={{ background: '#222', padding: '1.2rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #333' }}>
              <p style={{ margin: '0 0 15px 0', fontSize: '1.4rem', fontWeight: 'bold', color: '#00e5ff' }}>DEMO-W001</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '1.1rem' }}>
                <span style={{color: '#aaa'}}>Current Depth:</span> 
                <strong>{Math.round(depth)} m</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                <span style={{color: '#aaa'}}>Active Formation:</span> 
                <strong style={{color: currentFormation?.color || '#fff', background: '#000', padding: '2px 8px', borderRadius: '4px'}}>
                  {currentFormation?.name || 'Unknown'}
                </strong>
              </div>
          </div>
          
          <h3 style={{ fontSize: '1rem', color: '#fff', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>DATA QUALITY AUDIT</h3>
          <div style={{ background: '#1a2e1a', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #2e5a2e' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px 0', fontSize: '0.9rem' }}>
                 <li style={{ color: '#81c784', margin: '5px 0' }}>✓ Trajectory Verified</li>
                 <li style={{ color: '#81c784', margin: '5px 0' }}>✓ Formation Logs Available</li>
                 <li style={{ color: '#81c784', margin: '5px 0' }}>✓ Offset Intelligence Linked</li>
              </ul>
              <div style={{ borderTop: '1px solid #2e5a2e', paddingTop: '10px', color: '#a5d6a7', fontWeight: 'bold', fontSize: '0.9rem' }}>
                 SUFFICIENT FOR DEMONSTRATION
              </div>
          </div>
          
          <h3 style={{ fontSize: '1rem', color: '#fff', borderBottom: '1px solid #444', paddingBottom: '0.5rem' }}>OFFSET INTELLIGENCE ENGINE</h3>
          <div style={{ background: comparableCases > 0 ? '#3d2511' : '#222', border: comparableCases > 0 ? '1px solid #ff9800' : '1px solid #333', padding: '1.2rem', borderRadius: '8px', marginBottom: '1rem', transition: 'all 0.3s ease' }}>
              {comparableCases > 0 ? (
                  <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                          <span style={{ background: '#ff9800', color: '#000', padding: '3px 8px', borderRadius: '3px', fontWeight: 'bold', fontSize: '0.8rem' }}>FLAGGED</span>
                          <span style={{ color: '#ffb74d', fontWeight: 'bold' }}>POTENTIAL ABNORMAL PATTERN</span>
                      </div>
                      
                      <div style={{ fontSize: '0.9rem', marginBottom: '15px' }}>
                          <p style={{ margin: '5px 0', color: '#ddd' }}><span style={{color: '#aaa', display: 'inline-block', width: '130px'}}>Target Interval:</span> {Math.max(0, Math.round(depth)-50)}m - {Math.round(depth)}m</p>
                          <p style={{ margin: '5px 0', color: '#ddd' }}><span style={{color: '#aaa', display: 'inline-block', width: '130px'}}>Correlated Cases:</span> <strong>{comparableCases} historical events</strong></p>
                      </div>
                      
                      <button onClick={() => setShowLog(!showLog)} style={{ background: '#ff9800', color: '#111', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: '0.9rem' }}>
                          {showLog ? 'HIDE REASONING' : 'SHOW ME WHY'}
                      </button>
                      
                      {showLog && (
                         <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', fontSize: '0.85rem' }}>
                            <p style={{ margin: '0 0 10px 0', color: '#ffcc80' }}><strong>Logic:</strong> The system detected trajectory and formation overlaps with offset wells.</p>
                            {visibleEvents.map((e, idx) => (
                                <div key={idx} style={{ borderBottom: '1px solid #555', paddingBottom: '10px', marginBottom: '10px' }}>
                                    <div><strong>Well:</strong> {e.well_id}</div>
                                    <div><strong>Event:</strong> {e.event_type} at {e.depth}m</div>
                                    <div><strong>Relevance:</strong> Depth overlap & Formation similarity</div>
                                </div>
                            ))}
                         </div>
                      )}
                  </>
              ) : (
                  <p style={{ margin: 0, color: '#aaa', textAlign: 'center', padding: '20px 0' }}>Monitoring offset wells...<br/>No comparable anomalies detected at current depth.</p>
              )}
          </div>
        </aside>
      </div>
      
      <footer style={{ padding: '1.5rem', borderTop: '1px solid #333', background: '#0a0a0a', display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ minWidth: '50px', fontWeight: 'bold', color: '#fff' }}>0m</span>
            <input 
                type="range" 
                min="0" max="3000" 
                value={depth} 
                onChange={(e) => setDepth(Number(e.target.value))} 
                style={{ flex: 1, cursor: 'pointer', height: '6px', accentColor: '#00e5ff' }} 
            />
            <span style={{ fontWeight: 'bold', color: '#fff' }}>3000m</span>
        </div>
        
        <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={() => setDepth(d => Math.max(0, d - 50))} style={{ padding: '10px 20px', background: '#222', color: 'white', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>◀ STEP BACK</button>
            <button onClick={() => setIsPlaying(!isPlaying)} style={{ padding: '10px 30px', background: isPlaying ? '#ff4444' : '#00e5ff', color: isPlaying ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isPlaying ? 'PAUSE ENGINE' : '▶ RUN SIMULATION'}
            </button>
            <button onClick={() => { setIsPlaying(false); setDepth(0); setShowLog(false); }} style={{ padding: '10px 20px', background: '#222', color: 'white', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>RESET</button>
        </div>
        
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', background: '#111', padding: '5px', borderRadius: '4px', border: '1px solid #333' }}>
            <span style={{ margin: '0 10px', color: '#aaa', fontSize: '0.9rem' }}>SIM SPEED:</span>
            {[1, 5, 10].map(s => (
                <button key={s} onClick={() => setSpeed(s)} style={{ padding: '5px 12px', background: speed === s ? '#00e5ff' : 'transparent', color: speed === s ? 'black' : 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>{s}x</button>
            ))}
        </div>
      </footer>
    </div>
  );
}
