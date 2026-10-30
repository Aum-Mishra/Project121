import os

frontend_dir = "frontend"
os.makedirs(frontend_dir, exist_ok=True)
os.makedirs(os.path.join(frontend_dir, "src"), exist_ok=True)

with open(os.path.join(frontend_dir, "package.json"), "w") as f:
    f.write('''{
  "name": "nwis3d",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@react-three/drei": "^9.105.6",
    "@react-three/fiber": "^8.16.2",
    "lucide-react": "^0.379.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "three": "^0.164.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@types/three": "^0.164.0",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.2.2",
    "vite": "^5.2.0"
  }
}
''')

with open(os.path.join(frontend_dir, "vite.config.ts"), "w") as f:
    f.write('''import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
''')

with open(os.path.join(frontend_dir, "index.html"), "w") as f:
    f.write('''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NWIS 3D Simulator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
''')

with open(os.path.join(frontend_dir, "tsconfig.json"), "w") as f:
    f.write('''{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
''')

with open(os.path.join(frontend_dir, "tsconfig.node.json"), "w") as f:
    f.write('''{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
''')

print("Frontend setup files generated.")
